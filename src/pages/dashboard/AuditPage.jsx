import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLog } from '@/api/audit';

const PAGE_SIZE = 20;
function fmt(s) { return s ?? '—'; }

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', page],
    queryFn: () => getAuditLog({ page, limit: PAGE_SIZE }),
  });
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Audit Trail</div>
          <div className="page-subtitle">All user actions and changes</div>
        </div>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={5}>Loading…</td></tr> : list.length === 0 ? <tr><td colSpan={5}>No entries</td></tr> : list.map((a) => (
                  <tr key={a._id}>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(a.timestamp)}</td>
                    <td>{fmt(a.userId)}</td>
                    <td>{fmt(a.action)}</td>
                    <td>{fmt(a.entity)}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.entityId ?? a.before ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta.total > PAGE_SIZE && (
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {meta.page ?? page}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= Math.ceil((meta.total ?? 0) / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
