import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDebtors } from '@/api/debtors';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';

const LIMIT = 20;
function fmt(n) { return n == null ? '—' : 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 }); }

export default function DebtorsPage() {
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['debtors', page],
    queryFn: () => getDebtors({ page, limit: LIMIT }),
  });
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  const guestPaymentsHref = useMemo(() => {
    if (location.pathname.startsWith('/admin')) return '/admin/payments';
    if (location.pathname.startsWith('/finance')) return '/finance/payments';
    return null;
  }, [location.pathname]);

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Debtors</div>
          <div className="page-subtitle">Outstanding amounts and aging</div>
        </div>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      {guestPaymentsHref ? (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          To record a guest receipt against a booking, use{' '}
          <Link to={guestPaymentsHref} style={{ fontWeight: 600 }}>
            Payments
          </Link>
          .
        </p>
      ) : null}
      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search name, contact, status…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Amount owed</th><th>Paid</th><th className="statement-table-num">Balance</th><th>Status</th></tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={6}>No debtors</td></tr>}
                {!isLoading && list.map((d, idx) => (
                  <tr key={d._id ?? d.id ?? `${d.name || 'debtor'}-${d.contactEmail || d.contactPhone || idx}`}>
                    <td><strong>{d.name || '—'}</strong></td>
                    <td>{d.contactEmail || d.contactPhone || '—'}</td>
                    <td className="statement-table-num">{fmt(d.amountOwed)}</td>
                    <td className="statement-table-num">{fmt(d.amountPaid)}</td>
                    <td className="statement-table-num">{fmt(d.balance ?? (d.amountOwed - (d.amountPaid || 0)))}</td>
                    <td><span className={'badge ' + (d.status === 'paid' ? 'badge-paid' : 'badge-pending')}>{d.status || 'outstanding'}</span></td>
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
