import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInvoices } from '@/api/invoices';

const LIMIT = 20;
function fmt(n) { return n == null ? '—' : 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 }); }

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices', page],
    queryFn: () => getInvoices({ page, limit: LIMIT }),
  });
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Invoices</div>
          <div className="page-subtitle">Create and manage invoices</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm"><i className="fas fa-plus" /> New</button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Number</th><th>Type</th><th>Due</th><th className="statement-table-num">Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={5}>No invoices</td></tr>}
                {!isLoading && list.map((i) => (
                  <tr key={i._id}>
                    <td><strong>{i.invoiceNumber || i._id || '—'}</strong></td>
                    <td>{i.type || '—'}</td>
                    <td>{i.dueDate || '—'}</td>
                    <td className="statement-table-num">{fmt(i.total)}</td>
                    <td><span className={'badge ' + (i.status === 'paid' ? 'badge-paid' : 'badge-pending')}>{i.status || 'draft'}</span></td>
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
