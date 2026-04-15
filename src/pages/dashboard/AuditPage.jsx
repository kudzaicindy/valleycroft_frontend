import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLog } from '@/api/audit';

const PAGE_SIZE = 20;
function fmt(s) {
  return s ?? '—';
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', page],
    queryFn: () => getAuditLog({ page, limit: PAGE_SIZE }),
  });
  const rawList = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  const actionOptions = useMemo(() => {
    const set = new Set();
    rawList.forEach((a) => {
      if (a.action && String(a.action).trim()) set.add(String(a.action).trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rawList]);

  const list = useMemo(() => {
    let rows = rawList;
    if (actionFilter.trim()) {
      const af = actionFilter.trim().toLowerCase();
      rows = rows.filter((a) => String(a.action || '').toLowerCase() === af);
    }
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (a) =>
        String(a.userId || '').toLowerCase().includes(q) ||
        String(a.action || '').toLowerCase().includes(q) ||
        String(a.entity || '').toLowerCase().includes(q) ||
        String(a.entityId || a.before || '').toLowerCase().includes(q)
    );
  }, [rawList, search, actionFilter]);

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Audit Trail</div>
          <div className="page-subtitle">All user actions and changes</div>
        </div>
      </div>
      {error && (
        <div className="card card--error">
          <div className="card-body">{error.message}</div>
        </div>
      )}
      <div className="bookings-filters-bar" style={{ marginBottom: 12 }}>
        <input
          type="search"
          className="form-control"
          placeholder="Search user, action, entity…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select className="form-control" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">All actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
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
                    <td colSpan={5}>Loading…</td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No entries</td>
                  </tr>
                ) : (
                  list.map((a) => (
                    <tr key={a._id}>
                      <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(a.timestamp)}</td>
                      <td>{fmt(a.userId)}</td>
                      <td>{fmt(a.action)}</td>
                      <td>{fmt(a.entity)}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.entityId ?? a.before ?? '—'}</td>
                    </tr>
                  ))
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
