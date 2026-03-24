import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getCashflow } from '@/api/finance';
import FinanceLegacyReportsBanner from '@/components/dashboard/FinanceLegacyReportsBanner';
import { MONTH_SHORT, defaultReportYear, monthRange, yearOptions, yearRange } from '@/utils/financePeriods';
import { cashflowDetailedSections } from '@/utils/financeStatementHelpers';

function money(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num) || num === 0) return '-';
  return num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const QUARTERS = [
  { value: 'all', label: 'All Quarters', months: [...Array(12).keys()] },
  { value: 'q1', label: 'Q1', months: [0, 1, 2] },
  { value: 'q2', label: 'Q2', months: [3, 4, 5] },
  { value: 'q3', label: 'Q3', months: [6, 7, 8] },
  { value: 'q4', label: 'Q4', months: [9, 10, 11] },
];

export default function CashFlow() {
  const [year, setYear] = useState(defaultReportYear);
  const [quarter, setQuarter] = useState('all');
  const [entity, setEntity] = useState('all');
  const years = useMemo(() => yearOptions({ back: 8, forward: 1 }), []);

  const annualRange = useMemo(() => yearRange(year), [year]);
  const { error, refetch } = useQuery({
    queryKey: ['finance', 'cashflow', 'annual', annualRange.start, annualRange.end],
    queryFn: () => getCashflow({ start: annualRange.start, end: annualRange.end }),
  });

  const monthQueries = useQueries({
    queries: MONTH_SHORT.map((_, mi) => {
      const { start, end } = monthRange(year, mi);
      return {
        queryKey: ['finance', 'cashflow', 'month', year, mi],
        queryFn: () => getCashflow({ start, end }),
      };
    }),
  });

  const loading = monthQueries.some((q) => q.isLoading);
  const cols = monthQueries.map((q) => cashflowDetailedSections(q.data));
  const operatingIncomeByMonth = cols.map((c) => c.operatingIncome);
  const operatingExpenseByMonth = cols.map((c) => c.operatingExpense);
  const investingRowsByMonth = cols.map((c) => c.investingRows);
  const financingRowsByMonth = cols.map((c) => c.financingRows);
  const cashAccountsByMonth = cols.map((c) => c.cashAccounts);
  const monthHasData = monthQueries.map((q) => q.data != null);
  const visibleMonths = QUARTERS.find((q) => q.value === quarter)?.months ?? QUARTERS[0].months;
  const operatingIncomeKeys = Array.from(new Set(visibleMonths.flatMap((mi) => operatingIncomeByMonth[mi].map((r) => r.key))));
  const operatingExpenseKeys = Array.from(new Set(visibleMonths.flatMap((mi) => operatingExpenseByMonth[mi].map((r) => r.key))));
  const investingKeys = Array.from(new Set(visibleMonths.flatMap((mi) => investingRowsByMonth[mi].map((r) => r.key))));
  const financingKeys = Array.from(new Set(visibleMonths.flatMap((mi) => financingRowsByMonth[mi].map((r) => r.key))));
  const cashAccountKeys = Array.from(new Set(visibleMonths.flatMap((mi) => cashAccountsByMonth[mi].map((r) => r.key))));
  const rowLabelByKey = useMemo(() => {
    const map = {};
    [...operatingIncomeByMonth, ...operatingExpenseByMonth, ...investingRowsByMonth, ...financingRowsByMonth, ...cashAccountsByMonth].forEach((sectionRows) => {
      sectionRows.forEach((r) => {
        if (!map[r.key]) map[r.key] = r.label;
      });
    });
    return map;
  }, [operatingIncomeByMonth, operatingExpenseByMonth, investingRowsByMonth, financingRowsByMonth, cashAccountsByMonth]);

  const operating = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? cols[mi].operating : 0), 0);
  const investing = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? cols[mi].investing : 0), 0);
  const financing = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? cols[mi].financing : 0), 0);
  const net = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? cols[mi].netChange : 0), 0);
  const openingCash = cols[visibleMonths[0]]?.openingCash ?? 0;
  const closingCash = cols[visibleMonths[visibleMonths.length - 1]]?.closingCash ?? (openingCash + net);
  const hasAnyData = visibleMonths.some((mi) => monthHasData[mi]);

  return (
    <div className="finance-statement-page acct-ui-page">
      <FinanceLegacyReportsBanner />

      <div className="acct-ui-topbar">
        <div className="acct-ui-topbar-title-wrap">
          <div className="acct-ui-topbar-title">Cash Flow Statement</div>
          <div className="acct-ui-topbar-sub">Track cash inflows and outflows using accounting endpoints</div>
        </div>
        <div className="acct-ui-controls">
          <label>Year
            <select className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>Quarter
            <select className="form-control" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              {QUARTERS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
          </label>
          <label>Entity
            <select className="form-control" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="all">All Entities</option>
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => refetch()}><i className="fas fa-sync" /> Refresh</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}><i className="fas fa-download" /> Export</button>
        </div>
      </div>

      <div className="acct-ui-meta">Year: {year} · Quarter: {QUARTERS.find((q) => q.value === quarter)?.label} · Entity: All Entities</div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      <div className="card finance-stmt-card acct-ui-table-card">
        <div className="card-body card-body--no-pad">
          <table className="acct-ui-table">
            <thead>
              <tr>
                <th>Description</th>
                {visibleMonths.map((mi) => <th key={mi}>{MONTH_SHORT[mi].toUpperCase()} {String(year).slice(-2)}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash Flows From Operating Activities</td></tr>
              {operatingIncomeKeys.map((k) => (
                <tr key={`op-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount;
                    return <td key={mi} className={`num ${(Number(v) || 0) >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] && v != null ? money(v) : '')}</td>;
                  })}
                  <td className={`num ${visibleMonths.reduce((s, mi) => s + (operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}`}>
                    {loading ? '…' : money(visibleMonths.reduce((s, mi) => s + (operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                  </td>
                </tr>
              ))}
              <tr className="acct-ui-total-row">
                <td><strong>Total Operating Income</strong></td>
                {visibleMonths.map((mi) => {
                  const v = operatingIncomeByMonth[mi].reduce((s, r) => s + r.amount, 0);
                  return <td key={mi} className={`num ${v >= 0 ? 'pos' : 'neg'}`}><strong>{loading ? '…' : (monthHasData[mi] ? money(v) : '')}</strong></td>;
                })}
                <td className="num pos"><strong>{loading ? '…' : money(visibleMonths.reduce((s, mi) => s + operatingIncomeByMonth[mi].reduce((a, r) => a + r.amount, 0), 0))}</strong></td>
              </tr>
              {operatingExpenseKeys.map((k) => (
                <tr key={`opex-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount;
                    return <td key={mi} className={`num ${(Number(v) || 0) >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] && v != null ? money(v) : '')}</td>;
                  })}
                  <td className={`num ${visibleMonths.reduce((s, mi) => s + (operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}`}>
                    {loading ? '…' : money(visibleMonths.reduce((s, mi) => s + (operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                  </td>
                </tr>
              ))}
              <tr>
                <td><strong>Total Operating Expenses</strong></td>
                {visibleMonths.map((mi) => {
                  const v = operatingExpenseByMonth[mi].reduce((s, r) => s + r.amount, 0);
                  return <td key={mi} className={`num ${v >= 0 ? 'pos' : 'neg'}`}><strong>{loading ? '…' : (monthHasData[mi] ? money(v) : '')}</strong></td>;
                })}
                <td className={`num ${visibleMonths.reduce((s, mi) => s + operatingExpenseByMonth[mi].reduce((a, r) => a + r.amount, 0), 0) >= 0 ? 'pos' : 'neg'}`}><strong>{loading ? '…' : money(visibleMonths.reduce((s, mi) => s + operatingExpenseByMonth[mi].reduce((a, r) => a + r.amount, 0), 0))}</strong></td>
              </tr>
              <tr className="acct-ui-total-row">
                <td><strong>Net Cash From Operating Activities</strong></td>
                {visibleMonths.map((mi) => <td key={mi} className={`num ${(cols[mi].operating || 0) >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] ? money(cols[mi].operating) : '')}</td>)}
                <td className={`num ${operating >= 0 ? 'pos' : 'neg'}`}><strong>{loading ? '…' : (hasAnyData ? money(operating) : '')}</strong></td>
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash Flows From Investing Activities</td></tr>
              {investingKeys.map((k) => (
                <tr key={`inv-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = investingRowsByMonth[mi].find((r) => r.key === k)?.amount;
                    return <td key={mi} className={`num ${(Number(v) || 0) >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] && v != null ? money(v) : '')}</td>;
                  })}
                  <td className={`num ${visibleMonths.reduce((s, mi) => s + (investingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}`}>
                    {loading ? '…' : money(visibleMonths.reduce((s, mi) => s + (investingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                  </td>
                </tr>
              ))}
              <tr>
                <td><strong>Net Cash From Investing Activities</strong></td>
                {visibleMonths.map((mi) => <td key={mi} className={`num ${(cols[mi].investing || 0) >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] ? money(cols[mi].investing) : '')}</td>)}
                <td className={`num ${investing >= 0 ? 'pos' : 'neg'}`}><strong>{loading ? '…' : (hasAnyData ? money(investing) : '')}</strong></td>
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash Flows From Financing Activities</td></tr>
              {financingKeys.map((k) => (
                <tr key={`fin-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = financingRowsByMonth[mi].find((r) => r.key === k)?.amount;
                    return <td key={mi} className={`num ${(Number(v) || 0) >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] && v != null ? money(v) : '')}</td>;
                  })}
                  <td className={`num ${visibleMonths.reduce((s, mi) => s + (financingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}`}>
                    {loading ? '…' : money(visibleMonths.reduce((s, mi) => s + (financingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                  </td>
                </tr>
              ))}
              <tr>
                <td><strong>Net Cash From Financing Activities</strong></td>
                {visibleMonths.map((mi) => <td key={mi} className={`num ${(cols[mi].financing || 0) >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] ? money(cols[mi].financing) : '')}</td>)}
                <td className={`num ${financing >= 0 ? 'pos' : 'neg'}`}><strong>{loading ? '…' : (hasAnyData ? money(financing) : '')}</strong></td>
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash Summary</td></tr>
              <tr className="acct-ui-total-row">
                <td><strong>Net Change In Cash</strong></td>
                {visibleMonths.map((mi) => {
                  const v = cols[mi].netChange;
                  return <td key={mi} className={`num ${v >= 0 ? 'pos' : 'neg'}`}>{loading ? '…' : (monthHasData[mi] ? money(v) : '')}</td>;
                })}
                <td className={`num ${net >= 0 ? 'pos' : 'neg'}`}><strong>{loading ? '…' : (hasAnyData ? money(net) : '')}</strong></td>
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash And Cash Equivalents</td></tr>
              {cashAccountKeys.map((k) => (
                <tr key={`cash-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = cashAccountsByMonth[mi].find((r) => r.key === k)?.amount;
                    return <td key={mi} className="num">{loading ? '…' : (monthHasData[mi] && v != null ? money(v) : '')}</td>;
                  })}
                  <td className="num">
                    {loading ? '…' : money(visibleMonths.reduce((s, mi) => s + (cashAccountsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                  </td>
                </tr>
              ))}
              <tr>
                <td>Cash at Beginning of Period</td>
                {visibleMonths.map((mi) => <td key={mi} className="num">{loading ? '…' : (monthHasData[mi] ? money(cols[mi].openingCash) : '')}</td>)}
                <td className="num">{loading ? '…' : (hasAnyData ? money(openingCash) : '')}</td>
              </tr>
              <tr className="acct-ui-total-row">
                <td><strong>Cash at End of Period</strong></td>
                {visibleMonths.map((mi) => <td key={mi} className="num"><strong>{loading ? '…' : (monthHasData[mi] ? money(cols[mi].closingCash) : '')}</strong></td>)}
                <td className="num"><strong>{loading ? '…' : (hasAnyData ? money(closingCash) : '')}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
