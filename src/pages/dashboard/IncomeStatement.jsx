import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getIncomeStatement } from '@/api/finance';
import FinanceLegacyReportsBanner from '@/components/dashboard/FinanceLegacyReportsBanner';
import StatementAmountCell from '@/components/dashboard/StatementAmountCell';
import StatementTransactionsModal from '@/components/dashboard/StatementTransactionsModal';
import { MONTH_SHORT, defaultReportYear, monthRange, yearOptions, yearRange } from '@/utils/financePeriods';
import { incomeStatementMetrics } from '@/utils/financeStatementHelpers';
import {
  extractAccountCodesFromStatementLineKey,
  mergedMonthRange,
  statementKeyToTransactionCategory,
} from '@/utils/statementDrilldown';

function money(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num) || num === 0) return '-';
  return num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rowKey(row, idx, prefix) {
  return String(
    row?.key ??
    row?.code ??
    row?.accountCode ??
    row?.name ??
    row?.label ??
    row?.category ??
    row?.description ??
    `${prefix}_${idx}`
  );
}

function rowLabel(row) {
  return String(row?.label ?? row?.name ?? row?.description ?? row?.category ?? row?.accountName ?? '—');
}

function rowAmount(row) {
  return Number(row?.amount ?? row?.value ?? row?.total ?? 0) || 0;
}

const QUARTERS = [
  { value: 'all', label: 'All Quarters', months: [...Array(12).keys()] },
  { value: 'q1', label: 'Q1', months: [0, 1, 2] },
  { value: 'q2', label: 'Q2', months: [3, 4, 5] },
  { value: 'q3', label: 'Q3', months: [6, 7, 8] },
  { value: 'q4', label: 'Q4', months: [9, 10, 11] },
];

export default function IncomeStatement() {
  const [year, setYear] = useState(defaultReportYear);
  const [quarter, setQuarter] = useState('all');
  const [basis, setBasis] = useState('accrual');
  const [entity, setEntity] = useState('all');
  const [drill, setDrill] = useState(null);
  const years = useMemo(() => yearOptions({ back: 8, forward: 1 }), []);

  const annualRange = useMemo(() => yearRange(year), [year]);
  const { error } = useQuery({
    queryKey: ['finance', 'income-statement', 'annual', annualRange.start, annualRange.end],
    queryFn: () => getIncomeStatement({ start: annualRange.start, end: annualRange.end }),
  });

  const monthQueries = useQueries({
    queries: MONTH_SHORT.map((_, mi) => {
      const { start, end } = monthRange(year, mi);
      return {
        queryKey: ['finance', 'income-statement', 'month', year, mi],
        queryFn: () => getIncomeStatement({ start, end }),
      };
    }),
  });

  const loading = monthQueries.some((q) => q.isLoading);
  const cols = monthQueries.map((q) => incomeStatementMetrics(q.data));
  const monthHasData = monthQueries.map((q) => q.data != null);
  const visibleMonths = QUARTERS.find((q) => q.value === quarter)?.months ?? QUARTERS[0].months;
  const incomeRowsByMonth = cols.map((c) => c.incomeRows || []);
  const expenseRowsByMonth = cols.map((c) => c.expenseRows || []);
  const incomeKeys = Array.from(new Set(visibleMonths.flatMap((mi) => incomeRowsByMonth[mi].map((r, i) => rowKey(r, i, 'income')))));
  const expenseKeys = Array.from(new Set(visibleMonths.flatMap((mi) => expenseRowsByMonth[mi].map((r, i) => rowKey(r, i, 'expense')))));
  const rowLabelMap = useMemo(() => {
    const map = {};
    incomeRowsByMonth.forEach((rows) => rows.forEach((r, i) => {
      const k = rowKey(r, i, 'income');
      if (!map[k]) map[k] = rowLabel(r);
    }));
    expenseRowsByMonth.forEach((rows) => rows.forEach((r, i) => {
      const k = rowKey(r, i, 'expense');
      if (!map[k]) map[k] = rowLabel(r);
    }));
    return map;
  }, [incomeRowsByMonth, expenseRowsByMonth]);

  const revenueTotal = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? cols[mi].revenue : 0), 0);
  const expenseTotal = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? cols[mi].expense : 0), 0);
  const netTotal = revenueTotal - expenseTotal;
  const hasAnyRevenue = visibleMonths.some((mi) => monthHasData[mi]);
  const hasAnyExpense = visibleMonths.some((mi) => monthHasData[mi]);
  const hasAnyNet = visibleMonths.some((mi) => monthHasData[mi]);
  const merged = useMemo(() => mergedMonthRange(year, visibleMonths), [year, visibleMonths]);
  const quarterLabel = QUARTERS.find((q) => q.value === quarter)?.label ?? '';

  return (
    <div className="finance-statement-page acct-ui-page">
      <FinanceLegacyReportsBanner />

      <div className="acct-ui-topbar">
        <div className="acct-ui-topbar-title-wrap">
          <div className="acct-ui-topbar-title">Income Statement</div>
          <div className="acct-ui-topbar-sub">Track revenue and expenses using accrual-based accounting</div>
        </div>
        <div className="acct-ui-controls">
          <label>Year
            <select className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>Basis
            <select className="form-control" value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="accrual">Accrual</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label>Entity
            <select className="form-control" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="all">All Entities</option>
            </select>
          </label>
          <label>Quarter
            <select className="form-control" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              {QUARTERS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}><i className="fas fa-file-pdf" /> PDF</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}><i className="fas fa-file-excel" /> Excel</button>
        </div>
      </div>

      <div className="acct-ui-meta">Year: {year} · Basis: {basis[0].toUpperCase() + basis.slice(1)} · Entity: All Entities</div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      <StatementTransactionsModal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title ?? ''}
        subtitle={drill?.subtitle}
        start={drill?.start ?? ''}
        end={drill?.end ?? ''}
        category={drill?.category ?? null}
        type={drill?.type ?? null}
        accountCodes={drill?.accountCodes ?? null}
        statementAmount={drill?.statementAmount ?? null}
        sumMode={drill?.sumMode ?? 'abs'}
      />

      <div className="card finance-stmt-card acct-ui-table-card">
        <div className="card-body card-body--no-pad">
          <table className="acct-ui-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                {visibleMonths.map((mi) => <th key={mi}>{MONTH_SHORT[mi].toUpperCase()} {String(year).slice(-2)}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="acct-ui-section acct-ui-section--pos"><td colSpan={visibleMonths.length + 3}>Revenue accounts</td></tr>
              {incomeKeys.map((k) => (
                <tr key={`income-${k}`}>
                  <td>{rowLabelMap[k] || k}</td>
                  <td>Income</td>
                  {visibleMonths.map((mi) => {
                    const rows = incomeRowsByMonth[mi];
                    const match = rows.find((r, i) => rowKey(r, i, 'income') === k);
                    const v = match ? rowAmount(match) : null;
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    return (
                      <StatementAmountCell
                        key={mi}
                        className=""
                        loading={loading}
                        hasData={monthHasData[mi]}
                        rawValue={v}
                        display={monthHasData[mi] && v != null ? money(v) : ''}
                        onDrill={() =>
                          setDrill({
                            title: `Income statement — ${rowLabelMap[k] || k}`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: 'income',
                            accountCodes: extractAccountCodesFromStatementLineKey(k),
                            statementAmount: v != null ? Number(v) : null,
                            sumMode: 'abs',
                          })
                        }
                      />
                    );
                  })}
                  <StatementAmountCell
                    className="pos"
                    loading={loading}
                    hasData={hasAnyRevenue}
                    rawValue={visibleMonths.reduce((s, mi) => {
                      const rows = incomeRowsByMonth[mi];
                      const match = rows.find((r, i) => rowKey(r, i, 'income') === k);
                      return s + (match ? rowAmount(match) : 0);
                    }, 0)}
                    display={money(
                      visibleMonths.reduce((s, mi) => {
                        const rows = incomeRowsByMonth[mi];
                        const match = rows.find((r, i) => rowKey(r, i, 'income') === k);
                        return s + (match ? rowAmount(match) : 0);
                      }, 0)
                    )}
                    onDrill={
                      merged
                        ? () => {
                            const totalVal = visibleMonths.reduce((s, mi) => {
                              const rows = incomeRowsByMonth[mi];
                              const match = rows.find((r, i) => rowKey(r, i, 'income') === k);
                              return s + (match ? rowAmount(match) : 0);
                            }, 0);
                            setDrill({
                              title: `Income statement — ${rowLabelMap[k] || k}`,
                              subtitle: `Total · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: statementKeyToTransactionCategory(k),
                              type: 'income',
                              accountCodes: extractAccountCodesFromStatementLineKey(k),
                              statementAmount: totalVal,
                              sumMode: 'abs',
                            });
                          }
                        : undefined
                    }
                  />
                </tr>
              ))}
              <tr className="acct-ui-total-row">
                <td><strong>Total revenue</strong></td>
                <td />
                {visibleMonths.map((mi) => {
                  const v = cols[mi].revenue;
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className=""
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : <strong>{monthHasData[mi] ? money(v) : ''}</strong>}
                      onDrill={() =>
                        setDrill({
                          title: 'Total revenue',
                          subtitle: `${MONTH_SHORT[mi]} ${year}`,
                          start,
                          end,
                          category: null,
                          type: 'income',
                          statementAmount: v,
                          sumMode: 'abs',
                        })
                      }
                    />
                  );
                })}
                <StatementAmountCell
                  className="pos"
                  loading={loading}
                  hasData={hasAnyRevenue}
                  rawValue={revenueTotal}
                  display={loading ? '…' : <strong>{hasAnyRevenue ? money(revenueTotal) : ''}</strong>}
                  onDrill={
                    merged
                      ? () =>
                          setDrill({
                            title: 'Total revenue',
                            subtitle: `Total · ${quarterLabel} ${year}`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: 'income',
                            statementAmount: revenueTotal,
                            sumMode: 'abs',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neg"><td colSpan={visibleMonths.length + 3}>Expense accounts</td></tr>
              {expenseKeys.map((k) => (
                <tr key={`expense-${k}`}>
                  <td>{rowLabelMap[k] || k}</td>
                  <td>Expense</td>
                  {visibleMonths.map((mi) => {
                    const rows = expenseRowsByMonth[mi];
                    const match = rows.find((r, i) => rowKey(r, i, 'expense') === k);
                    const v = match ? rowAmount(match) : null;
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    return (
                      <StatementAmountCell
                        key={mi}
                        className=""
                        loading={loading}
                        hasData={monthHasData[mi]}
                        rawValue={v}
                        display={monthHasData[mi] && v != null ? money(v) : ''}
                        onDrill={() =>
                          setDrill({
                            title: `Income statement — ${rowLabelMap[k] || k}`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: 'expense',
                            accountCodes: extractAccountCodesFromStatementLineKey(k),
                            statementAmount: v != null ? Number(v) : null,
                            sumMode: 'abs',
                          })
                        }
                      />
                    );
                  })}
                  <StatementAmountCell
                    className="neg"
                    loading={loading}
                    hasData={hasAnyExpense}
                    rawValue={visibleMonths.reduce((s, mi) => {
                      const rows = expenseRowsByMonth[mi];
                      const match = rows.find((r, i) => rowKey(r, i, 'expense') === k);
                      return s + (match ? rowAmount(match) : 0);
                    }, 0)}
                    display={money(
                      visibleMonths.reduce((s, mi) => {
                        const rows = expenseRowsByMonth[mi];
                        const match = rows.find((r, i) => rowKey(r, i, 'expense') === k);
                        return s + (match ? rowAmount(match) : 0);
                      }, 0)
                    )}
                    onDrill={
                      merged
                        ? () => {
                            const totalVal = visibleMonths.reduce((s, mi) => {
                              const rows = expenseRowsByMonth[mi];
                              const match = rows.find((r, i) => rowKey(r, i, 'expense') === k);
                              return s + (match ? rowAmount(match) : 0);
                            }, 0);
                            setDrill({
                              title: `Income statement — ${rowLabelMap[k] || k}`,
                              subtitle: `Total · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: statementKeyToTransactionCategory(k),
                              type: 'expense',
                              accountCodes: extractAccountCodesFromStatementLineKey(k),
                              statementAmount: totalVal,
                              sumMode: 'abs',
                            });
                          }
                        : undefined
                    }
                  />
                </tr>
              ))}
              <tr className="acct-ui-total-row">
                <td><strong>Total expenses</strong></td>
                <td />
                {visibleMonths.map((mi) => {
                  const v = cols[mi].expense;
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className=""
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : <strong>{monthHasData[mi] ? money(v) : ''}</strong>}
                      onDrill={() =>
                        setDrill({
                          title: 'Total expenses',
                          subtitle: `${MONTH_SHORT[mi]} ${year}`,
                          start,
                          end,
                          category: null,
                          type: 'expense',
                          statementAmount: v,
                          sumMode: 'abs',
                        })
                      }
                    />
                  );
                })}
                <StatementAmountCell
                  className="neg"
                  loading={loading}
                  hasData={hasAnyExpense}
                  rawValue={expenseTotal}
                  display={loading ? '…' : <strong>{hasAnyExpense ? money(expenseTotal) : ''}</strong>}
                  onDrill={
                    merged
                      ? () =>
                          setDrill({
                            title: 'Total expenses',
                            subtitle: `Total · ${quarterLabel} ${year}`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: 'expense',
                            statementAmount: expenseTotal,
                            sumMode: 'abs',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-total-row">
                <td><strong>Net income / (loss)</strong></td>
                <td />
                {visibleMonths.map((mi) => {
                  const v = cols[mi].net;
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : monthHasData[mi] ? money(v) : ''}
                      onDrill={() =>
                        setDrill({
                          title: 'Net income / (loss)',
                          subtitle: `${MONTH_SHORT[mi]} ${year} · all transactions in period`,
                          start,
                          end,
                          category: null,
                          type: null,
                          statementAmount: v,
                          sumMode: 'signed',
                        })
                      }
                    />
                  );
                })}
                <StatementAmountCell
                  className={netTotal >= 0 ? 'pos' : 'neg'}
                  loading={loading}
                  hasData={hasAnyNet}
                  rawValue={netTotal}
                  display={loading ? '…' : <strong>{hasAnyNet ? money(netTotal) : ''}</strong>}
                  onDrill={
                    merged
                      ? () =>
                          setDrill({
                            title: 'Net income / (loss)',
                            subtitle: `Total · ${quarterLabel} ${year} · all transactions in period`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: null,
                            statementAmount: netTotal,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
