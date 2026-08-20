import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLog } from '@/api/audit';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';

const PAGE_SIZE = 20;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  '__v',
]);

function fmt(s) {
  return s == null || s === '' ? '—' : String(s);
}

function fmtTime(value) {
  if (value == null || value === '') return '—';
  const raw = String(value).replace(' ', 'T');
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Audit list contract guarantees userEmail; never expose the database id as the label. */
function auditUserInfo(entry) {
  const user = isPlainObject(entry?.user) ? entry.user : {};
  const email = String(entry?.userEmail || user.email || entry?.email || '').trim();
  const name = String(entry?.userName || user.name || (typeof entry?.user === 'string' ? entry.user : '') || '').trim();
  const role = String(user.role || entry?.userRole || '').trim();
  return {
    email: email || 'Unknown user',
    title: [name, role].filter(Boolean).join(' · ') || email || 'Unknown user',
  };
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function scrubValue(value) {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  Object.keys(value).forEach((key) => {
    if (SENSITIVE_KEYS.has(key)) return;
    out[key] = scrubValue(value[key]);
  });
  return out;
}

function formatValue(value) {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (value instanceof Date) return fmtTime(value.toISOString());
  try {
    return JSON.stringify(scrubValue(value), null, 2);
  } catch {
    return String(value);
  }
}

function summarizeObject(obj, maxKeys = 4) {
  if (!isPlainObject(obj)) return formatValue(obj);
  const keys = Object.keys(obj).filter((k) => !SENSITIVE_KEYS.has(k));
  if (!keys.length) return '—';
  const bits = keys.slice(0, maxKeys).map((k) => {
    const v = obj[k];
    if (v == null || typeof v === 'object') return k;
    const short = String(v).length > 28 ? `${String(v).slice(0, 28)}…` : String(v);
    return `${k}: ${short}`;
  });
  if (keys.length > maxKeys) bits.push(`+${keys.length - maxKeys} more`);
  return bits.join(' · ');
}

/**
 * Normalize common audit payload shapes into { before, after, changes, deleted }.
 */
function extractChangePayload(entry) {
  const before =
    entry?.before ??
    entry?.previous ??
    entry?.old ??
    entry?.oldValue ??
    entry?.previousValues ??
    entry?.snapshotBefore ??
    null;
  const after =
    entry?.after ??
    entry?.next ??
    entry?.new ??
    entry?.newValue ??
    entry?.updated ??
    entry?.snapshotAfter ??
    null;
  const changes =
    entry?.changes ??
    entry?.diff ??
    entry?.delta ??
    entry?.updatedFields ??
    null;
  const deleted =
    entry?.deleted ??
    entry?.deletedDocument ??
    entry?.removed ??
    (isDeleteAction(entry?.action) ? before || entry?.document || entry?.data || null : null);

  return {
    before: before == null ? null : scrubValue(before),
    after: after == null ? null : scrubValue(after),
    changes: changes == null ? null : scrubValue(changes),
    deleted: deleted == null ? null : scrubValue(deleted),
    note: entry?.details || entry?.message || entry?.description || entry?.reason || '',
  };
}

function isDeleteAction(action) {
  return /delete|remove|destroy/i.test(String(action || ''));
}

function isUpdateAction(action) {
  return /update|edit|patch|modify|change/i.test(String(action || ''));
}

function isCreateAction(action) {
  return /create|insert|add|new/i.test(String(action || ''));
}

function fieldDiffRows(before, after) {
  if (!isPlainObject(before) && !isPlainObject(after)) return [];
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !SENSITIVE_KEYS.has(k));
  return keys
    .map((key) => {
      const from = b[key];
      const to = a[key];
      const same = JSON.stringify(from) === JSON.stringify(to);
      return same ? null : { key, from, to };
    })
    .filter(Boolean);
}

function changesToRows(changes) {
  if (!changes) return [];
  if (Array.isArray(changes)) {
    return changes
      .map((row) => {
        if (!isPlainObject(row)) return null;
        const key = row.field || row.path || row.key || row.name;
        if (!key) return null;
        return {
          key: String(key),
          from: row.from ?? row.before ?? row.old ?? row.previous,
          to: row.to ?? row.after ?? row.new ?? row.next,
        };
      })
      .filter(Boolean);
  }
  if (!isPlainObject(changes)) return [];
  return Object.keys(changes)
    .filter((k) => !SENSITIVE_KEYS.has(k))
    .map((key) => {
      const val = changes[key];
      if (isPlainObject(val) && ('from' in val || 'to' in val || 'before' in val || 'after' in val || 'old' in val || 'new' in val)) {
        return {
          key,
          from: val.from ?? val.before ?? val.old ?? val.previous,
          to: val.to ?? val.after ?? val.new ?? val.next,
        };
      }
      return { key, from: undefined, to: val };
    });
}

function buildDetailSummary(entry) {
  const apiSummary = String(entry?.summary || '').trim();
  if (apiSummary) return apiSummary;

  const payload = extractChangePayload(entry);
  const entityRef = entry?.entityId ?? entry?.entityRef ?? entry?.recordId ?? '';
  const action = String(entry?.action || '');

  if (isDeleteAction(action)) {
    const snap = payload.deleted || payload.before;
    const who = entityRef ? `ID ${entityRef}` : 'record';
    if (snap && isPlainObject(snap)) return `Deleted ${who} — ${summarizeObject(snap)}`;
    if (snap != null) return `Deleted ${who} — ${formatValue(snap)}`;
    return entityRef ? `Deleted ${who}` : 'Deleted record';
  }

  const changeRows = changesToRows(payload.changes);
  const diffRows = changeRows.length ? changeRows : fieldDiffRows(payload.before, payload.after);
  if (diffRows.length) {
    const preview = diffRows
      .slice(0, 3)
      .map((r) => `${r.key}: ${formatValue(r.from)} → ${formatValue(r.to)}`)
      .join(' · ');
    const more = diffRows.length > 3 ? ` · +${diffRows.length - 3} more` : '';
    return `Edited ${diffRows.length} field${diffRows.length === 1 ? '' : 's'} — ${preview}${more}`;
  }

  if (isCreateAction(action) && payload.after) {
    return `Created — ${summarizeObject(payload.after)}`;
  }

  if (payload.note) return String(payload.note);
  if (entityRef) return `Entity ID ${entityRef}`;
  return '—';
}

function hasExpandableDetails(entry) {
  const payload = extractChangePayload(entry);
  const changeRows = changesToRows(payload.changes);
  const diffRows = changeRows.length ? changeRows : fieldDiffRows(payload.before, payload.after);
  return Boolean(
    diffRows.length ||
      payload.deleted ||
      payload.before ||
      payload.after ||
      (payload.note && String(payload.note).length > 80)
  );
}

function AuditChangePanel({ entry }) {
  const payload = extractChangePayload(entry);
  const changeRows = changesToRows(payload.changes);
  const diffRows = changeRows.length ? changeRows : fieldDiffRows(payload.before, payload.after);
  const deletedSnap = payload.deleted || (isDeleteAction(entry?.action) ? payload.before : null);

  return (
    <div className="audit-detail-panel">
      {entry?.entityId != null && entry.entityId !== '' ? (
        <div className="audit-detail-meta">
          <span className="audit-detail-meta-label">Entity ID</span>
          <code>{String(entry.entityId)}</code>
        </div>
      ) : null}

      {payload.note ? (
        <p className="audit-detail-note">{String(payload.note)}</p>
      ) : null}

      {diffRows.length > 0 ? (
        <div className="audit-detail-block">
          <div className="audit-detail-block-title">
            {isUpdateAction(entry?.action) || diffRows.length ? 'What changed' : 'Fields'}
          </div>
          <div className="statement-table-wrap">
            <table className="statement-table audit-diff-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <code>{row.key}</code>
                    </td>
                    <td className="audit-diff-before">
                      <pre>{formatValue(row.from)}</pre>
                    </td>
                    <td className="audit-diff-after">
                      <pre>{formatValue(row.to)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {deletedSnap ? (
        <div className="audit-detail-block">
          <div className="audit-detail-block-title">Deleted record</div>
          <pre className="audit-json-block">{formatValue(deletedSnap)}</pre>
        </div>
      ) : null}

      {!diffRows.length && !deletedSnap && payload.before ? (
        <div className="audit-detail-block">
          <div className="audit-detail-block-title">Before</div>
          <pre className="audit-json-block">{formatValue(payload.before)}</pre>
        </div>
      ) : null}

      {!diffRows.length && payload.after ? (
        <div className="audit-detail-block">
          <div className="audit-detail-block-title">
            {isCreateAction(entry?.action) ? 'Created record' : 'After'}
          </div>
          <pre className="audit-json-block">{formatValue(payload.after)}</pre>
        </div>
      ) : null}
    </div>
  );
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', page, actionFilter],
    queryFn: () =>
      getAuditLog({
        page,
        limit: PAGE_SIZE,
        action: actionFilter || undefined,
      }),
  });
  const rawList = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  const list = useMemo(() => {
    let rows = rawList;
    if (monthFilter) {
      rows = rows.filter((a) => {
        const ts = String(a.timestamp ?? a.createdAt ?? '').replace(' ', 'T');
        const d = ts.slice(0, 7);
        if (!d || d.length < 7) return true;
        return d === monthFilter;
      });
    }
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((a) => {
      const user = auditUserInfo(a);
      const details = buildDetailSummary(a).toLowerCase();
      return (
        user.email.toLowerCase().includes(q) ||
        user.title.toLowerCase().includes(q) ||
        String(a.userId || '').toLowerCase().includes(q) ||
        String(a.action || '').toLowerCase().includes(q) ||
        String(a.entity || '').toLowerCase().includes(q) ||
        String(a.entityId || '').toLowerCase().includes(q) ||
        details.includes(q)
      );
    });
  }, [rawList, search, monthFilter]);

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Audit Trail</div>
          <div className="page-subtitle">Who changed what — edits and deletions with before/after detail</div>
        </div>
      </div>
      {error && (
        <div className="card card--error">
          <div className="card-body">{error.message}</div>
        </div>
      )}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <DashboardListFilters
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search email, action, entity…"
          month={monthFilter}
          onMonthChange={setMonthFilter}
        />
        <select
          className="form-control"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
            setExpandedId(null);
          }}
          style={{ minWidth: 180 }}
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
        </select>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th className="transactions-expand-col" aria-label="Expand" />
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6}>Loading…</td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No entries</td>
                  </tr>
                ) : (
                  list.map((a) => {
                    const rowId = String(a._id ?? a.id ?? `${a.timestamp}-${a.action}-${a.entityId}`);
                    const expandable = hasExpandableDetails(a);
                    const open = expandedId === rowId;
                    const user = auditUserInfo(a);
                    return (
                      <Fragment key={rowId}>
                        <tr>
                          <td className="transactions-expand-cell">
                            {expandable ? (
                              <button
                                type="button"
                                className="tx-row-expand-btn"
                                aria-expanded={open}
                                aria-label={open ? 'Hide change details' : 'Show change details'}
                                onClick={() => setExpandedId(open ? null : rowId)}
                              >
                                <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
                              </button>
                            ) : (
                              <span className="audit-expand-placeholder" aria-hidden>
                                ·
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            {fmtTime(a.timestamp ?? a.createdAt)}
                          </td>
                          <td title={user.title}>{user.email}</td>
                          <td>
                            <span
                              className={`badge audit-action-badge audit-action-badge--${String(a.action || 'other')
                                .toLowerCase()
                                .replace(/[^a-z]/g, '-')}`}
                            >
                              {fmt(a.action)}
                            </span>
                          </td>
                          <td>{fmt(a.entity)}</td>
                          <td className="audit-details-cell">{buildDetailSummary(a)}</td>
                        </tr>
                        {open ? (
                          <tr className="transactions-detail-row">
                            <td colSpan={6}>
                              <AuditChangePanel entry={a} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {meta.total > PAGE_SIZE && (
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {meta.page ?? page}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={page >= Math.ceil((meta.total ?? 0) / PAGE_SIZE)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
