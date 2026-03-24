import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSalary } from '@/api/finance';

export default function SalaryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({ queryKey: ['salary', page], queryFn: () => getSalary({ page, limit: 20 }) });
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  function fmt(n) {
    if (n == null) return '-';
    return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Salary</div>
          <div className="page-subtitle">Record and view salary payments</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm"><i className="fas fa-plus" /> Record payment</button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Employee</th><th>Month</th><th>Amount</th><th>Paid on</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5}>Loading...</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={5}>No records</td></tr>}
                {!isLoading && list.map((s) => (
                  <tr key={s._id}>
                    <td>{(s.employee && s.employee.name) || s.employeeId || '-'}</td>
                    <td>{s.month || '-'}</td>
                    <td className="statement-table-num">{fmt(s.amount)}</td>
                    <td>{s.paidOn || '-'}</td>
                    <td>{s.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(meta.total || 0) > 20 && (
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {meta.page || page}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= Math.ceil((meta.total || 0) / 20)} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
