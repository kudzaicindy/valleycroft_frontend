import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSuppliers } from '@/api/suppliers';

const LIMIT = 20;

export default function SuppliersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['suppliers', page],
    queryFn: () => getSuppliers({ page, limit: LIMIT }),
  });
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Suppliers</div>
          <div className="page-subtitle">Supplier list and payment history</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm"><i className="fas fa-plus" /> Add</button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Category</th><th>Status</th></tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={4}>No suppliers</td></tr>}
                {!isLoading && list.map((s) => (
                  <tr key={s._id}>
                    <td><strong>{s.name || '—'}</strong></td>
                    <td>{s.contactEmail || s.contactPhone || '—'}</td>
                    <td>{s.category || '—'}</td>
                    <td><span className={'badge ' + (s.isActive !== false ? 'badge-active' : 'badge-inactive')}>{s.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(meta.total || 0) > LIMIT && (
            <div className="pagination-bar">
              <span className="pagination-info">Page {meta.page ?? page}</span>
              <div className="pagination-btns">
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= Math.ceil((meta.total || 0) / LIMIT)} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
