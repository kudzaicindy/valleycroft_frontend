import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getSalaryByEmployee } from '@/api/finance';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';

function fmt(n) {
  return n == null ? '—' : 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

export default function PayslipsPage() {
  const { user } = useAuth();
  const userId = user?.sub ?? user?._id;
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['salary', 'me', userId],
    queryFn: () => getSalaryByEmployee(userId),
    enabled: !!userId,
  });
  const listRaw = Array.isArray(data) ? data : (data?.data ?? []);

  const list = useMemo(() => {
    let rows = listRaw;
    if (monthFilter) {
      rows = rows.filter((s) => {
        const m = s.month != null && s.month !== '' ? String(s.month).slice(0, 7) : '';
        const fromPaid =
          s.paidOn != null && String(s.paidOn).length >= 7 ? String(s.paidOn).slice(0, 7) : '';
        return m === monthFilter || fromPaid === monthFilter;
      });
    }
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter(
      (s) =>
        String(s.notes || '').toLowerCase().includes(q) ||
        String(s.month || '').toLowerCase().includes(q) ||
        String(s.paidOn || s.paidAt || '').toLowerCase().includes(q)
    );
  }, [listRaw, monthFilter, tableSearch]);

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">My Payslips</div>
          <div className="page-subtitle">Your salary payment history</div>
        </div>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search notes, month, paid date…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Paid on</th>
                  <th className="statement-table-num">Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={4}>No payments yet</td></tr>}
                {!isLoading &&
                  list.map((s) => (
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
