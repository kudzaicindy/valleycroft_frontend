import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getSalaryByEmployee } from '@/api/finance';

function fmt(n) { return n == null ? '—' : 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 }); }

export default function PayslipsPage() {
  const { user } = useAuth();
  const userId = user?.sub ?? user?._id;
  const { data, isLoading, error } = useQuery({
    queryKey: ['salary', 'me', userId],
    queryFn: () => getSalaryByEmployee(userId),
    enabled: !!userId,
  });
  const list = Array.isArray(data) ? data : (data?.data ?? []);

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">My Payslips</div>
          <div className="page-subtitle">Your salary payment history</div>
        </div>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Month</th><th>Paid on</th><th className="statement-table-num">Amount</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={4}>No payments yet</td></tr>}
                {!isLoading && list.map((s) => (
                  <tr key={s._id}>
                    <td>{s.month || '—'}</td>
                    <td>{s.paidOn || s.paidAt || '—'}</td>
                    <td className="statement-table-num">{fmt(s.amount)}</td>
                    <td>{s.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
