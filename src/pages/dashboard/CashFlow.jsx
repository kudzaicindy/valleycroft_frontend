import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getCashflow } from '@/api/finance';
import FinanceLegacyReportsBanner from '@/components/dashboard/FinanceLegacyReportsBanner';
import StatementAmountCell from '@/components/dashboard/StatementAmountCell';
import StatementTransactionsModal from '@/components/dashboard/StatementTransactionsModal';
import { MONTH_SHORT, defaultReportYear, monthRange, yearOptions, yearRange } from '@/utils/financePeriods';
import { cashflowDetailedSections } from '@/utils/financeStatementHelpers';
import { mergedMonthRange, statementKeyToTransactionCategory } from '@/utils/statementDrilldown';

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
  const [drill, setDrill] = useState(null);
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
  const merged = useMemo(() => mergedMonthRange(year, visibleMonths), [year, visibleMonths]);
  const quarterLabel = QUARTERS.find((q) => q.value === quarter)?.label ?? '';

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

      <StatementTransactionsModal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title ?? ''}
        subtitle={drill?.subtitle}
        start={drill?.start ?? ''}
        end={drill?.end ?? ''}
        category={drill?.category ?? null}
        type={drill?.type ?? null}
        statementAmount={drill?.statementAmount ?? null}
        sumMode={drill?.sumMode ?? 'abs'}
      />

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
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    return (
                      <StatementAmountCell
                        key={mi}
                        className={(Number(v) || 0) >= 0 ? 'pos' : 'neg'}
                        loading={loading}
                        hasData={monthHasData[mi]}
                        rawValue={v}
                        display={monthHasData[mi] && v != null ? money(v) : ''}
                        onDrill={() =>
                          setDrill({
                            title: `Cash flow — ${rowLabelByKey[k] || k}`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: 'income',
                            statementAmount: Number(v),
                            sumMode: 'abs',
                          })
                        }
                      />
                    );
                  })}
                  <StatementAmountCell
                    className={visibleMonths.reduce((s, mi) => s + (operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}
                    loading={loading}
                    hasData={hasAnyData}
                    rawValue={visibleMonths.reduce((s, mi) => s + (operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount || 0), 0)}
                    display={money(visibleMonths.reduce((s, mi) => s + (operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                    onDrill={
                      merged
                        ? () => {
                            const totalVal = visibleMonths.reduce(
                              (s, mi) => s + (operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount || 0),
                              0
                            );
                            setDrill({
                              title: `Cash flow — ${rowLabelByKey[k] || k}`,
                              subtitle: `Total · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: statementKeyToTransactionCategory(k),
                              type: 'income',
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
                <td><strong>Total Operating Income</strong></td>
                {visibleMonths.map((mi) => {
                  const v = operatingIncomeByMonth[mi].reduce((s, r) => s + r.amount, 0);
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : <strong>{monthHasData[mi] ? money(v) : ''}</strong>}
                      onDrill={() =>
                        setDrill({
                          title: 'Total operating income (cash)',
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
                  hasData={hasAnyData}
                  rawValue={visibleMonths.reduce((s, mi) => s + operatingIncomeByMonth[mi].reduce((a, r) => a + r.amount, 0), 0)}
                  display={loading ? '…' : <strong>{money(visibleMonths.reduce((s, mi) => s + operatingIncomeByMonth[mi].reduce((a, r) => a + r.amount, 0), 0))}</strong>}
                  onDrill={
                    merged
                      ? () => {
                          const tv = visibleMonths.reduce((s, mi) => s + operatingIncomeByMonth[mi].reduce((a, r) => a + r.amount, 0), 0);
                          setDrill({
                            title: 'Total operating income (cash)',
                            subtitle: `Total · ${quarterLabel} ${year}`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: 'income',
                            statementAmount: tv,
                            sumMode: 'abs',
                          });
                        }
                      : undefined
                  }
                />
              </tr>
              {operatingExpenseKeys.map((k) => (
                <tr key={`opex-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount;
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    return (
                      <StatementAmountCell
                        key={mi}
                        className={(Number(v) || 0) >= 0 ? 'pos' : 'neg'}
                        loading={loading}
                        hasData={monthHasData[mi]}
                        rawValue={v}
                        display={monthHasData[mi] && v != null ? money(v) : ''}
                        onDrill={() =>
                          setDrill({
                            title: `Cash flow — ${rowLabelByKey[k] || k}`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: 'expense',
                            statementAmount: Number(v),
                            sumMode: 'abs',
                          })
                        }
                      />
                    );
                  })}
                  <StatementAmountCell
                    className={visibleMonths.reduce((s, mi) => s + (operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}
                    loading={loading}
                    hasData={hasAnyData}
                    rawValue={visibleMonths.reduce((s, mi) => s + (operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount || 0), 0)}
                    display={money(visibleMonths.reduce((s, mi) => s + (operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                    onDrill={
                      merged
                        ? () => {
                            const totalVal = visibleMonths.reduce(
                              (s, mi) => s + (operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount || 0),
                              0
                            );
                            setDrill({
                              title: `Cash flow — ${rowLabelByKey[k] || k}`,
                              subtitle: `Total · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: statementKeyToTransactionCategory(k),
                              type: 'expense',
                              statementAmount: totalVal,
                              sumMode: 'abs',
                            });
                          }
                        : undefined
                    }
                  />
                </tr>
              ))}
              <tr>
                <td><strong>Total Operating Expenses</strong></td>
                {visibleMonths.map((mi) => {
                  const v = operatingExpenseByMonth[mi].reduce((s, r) => s + r.amount, 0);
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : <strong>{monthHasData[mi] ? money(v) : ''}</strong>}
                      onDrill={() =>
                        setDrill({
                          title: 'Total operating expenses (cash)',
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
                  className={visibleMonths.reduce((s, mi) => s + operatingExpenseByMonth[mi].reduce((a, r) => a + r.amount, 0), 0) >= 0 ? 'pos' : 'neg'}
                  loading={loading}
                  hasData={hasAnyData}
                  rawValue={visibleMonths.reduce((s, mi) => s + operatingExpenseByMonth[mi].reduce((a, r) => a + r.amount, 0), 0)}
                  display={
                    loading ? '…' : (
                      <strong>
                        {money(visibleMonths.reduce((s, mi) => s + operatingExpenseByMonth[mi].reduce((a, r) => a + r.amount, 0), 0))}
                      </strong>
                    )
                  }
                  onDrill={
                    merged
                      ? () => {
                          const tv = visibleMonths.reduce((s, mi) => s + operatingExpenseByMonth[mi].reduce((a, r) => a + r.amount, 0), 0);
                          setDrill({
                            title: 'Total operating expenses (cash)',
                            subtitle: `Total · ${quarterLabel} ${year}`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: 'expense',
                            statementAmount: tv,
                            sumMode: 'abs',
                          });
                        }
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-total-row">
                <td><strong>Net Cash From Operating Activities</strong></td>
                {visibleMonths.map((mi) => {
                  const v = cols[mi].operating || 0;
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
                          title: 'Net cash from operating activities',
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
                  className={operating >= 0 ? 'pos' : 'neg'}
                  loading={loading}
                  hasData={hasAnyData}
                  rawValue={operating}
                  display={loading ? '…' : <strong>{hasAnyData ? money(operating) : ''}</strong>}
                  onDrill={
                    merged
                      ? () =>
                          setDrill({
                            title: 'Net cash from operating activities',
                            subtitle: `Total · ${quarterLabel} ${year} · all transactions in period`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: null,
                            statementAmount: operating,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash Flows From Investing Activities</td></tr>
              {investingKeys.map((k) => (
                <tr key={`inv-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = investingRowsByMonth[mi].find((r) => r.key === k)?.amount;
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    const tType = (Number(v) || 0) >= 0 ? 'income' : 'expense';
                    return (
                      <StatementAmountCell
                        key={mi}
                        className={(Number(v) || 0) >= 0 ? 'pos' : 'neg'}
                        loading={loading}
                        hasData={monthHasData[mi]}
                        rawValue={v}
                        display={monthHasData[mi] && v != null ? money(v) : ''}
                        onDrill={() =>
                          setDrill({
                            title: `Cash flow — ${rowLabelByKey[k] || k} (investing)`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: cat ? null : tType,
                            statementAmount: Number(v),
                            sumMode: 'abs',
                          })
                        }
                      />
                    );
                  })}
                  <StatementAmountCell
                    className={visibleMonths.reduce((s, mi) => s + (investingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}
                    loading={loading}
                    hasData={hasAnyData}
                    rawValue={visibleMonths.reduce((s, mi) => s + (investingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0)}
                    display={money(visibleMonths.reduce((s, mi) => s + (investingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                    onDrill={
                      merged
                        ? () => {
                            const totalVal = visibleMonths.reduce(
                              (s, mi) => s + (investingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0),
                              0
                            );
                            const cat = statementKeyToTransactionCategory(k);
                            const tType = totalVal >= 0 ? 'income' : 'expense';
                            setDrill({
                              title: `Cash flow — ${rowLabelByKey[k] || k} (investing)`,
                              subtitle: `Total · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: cat,
                              type: cat ? null : tType,
                              statementAmount: totalVal,
                              sumMode: 'abs',
                            });
                          }
                        : undefined
                    }
                  />
                </tr>
              ))}
              <tr>
                <td><strong>Net Cash From Investing Activities</strong></td>
                {visibleMonths.map((mi) => {
                  const v = cols[mi].investing || 0;
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
                          title: 'Net cash from investing activities',
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
                  className={investing >= 0 ? 'pos' : 'neg'}
                  loading={loading}
                  hasData={hasAnyData}
                  rawValue={investing}
                  display={loading ? '…' : <strong>{hasAnyData ? money(investing) : ''}</strong>}
                  onDrill={
                    merged
                      ? () =>
                          setDrill({
                            title: 'Net cash from investing activities',
                            subtitle: `Total · ${quarterLabel} ${year} · all transactions in period`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: null,
                            statementAmount: investing,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash Flows From Financing Activities</td></tr>
              {financingKeys.map((k) => (
                <tr key={`fin-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = financingRowsByMonth[mi].find((r) => r.key === k)?.amount;
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    const tType = (Number(v) || 0) >= 0 ? 'income' : 'expense';
                    return (
                      <StatementAmountCell
                        key={mi}
                        className={(Number(v) || 0) >= 0 ? 'pos' : 'neg'}
                        loading={loading}
                        hasData={monthHasData[mi]}
                        rawValue={v}
                        display={monthHasData[mi] && v != null ? money(v) : ''}
                        onDrill={() =>
                          setDrill({
                            title: `Cash flow — ${rowLabelByKey[k] || k} (financing)`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: cat ? null : tType,
                            statementAmount: Number(v),
                            sumMode: 'abs',
                          })
                        }
                      />
                    );
                  })}
                  <StatementAmountCell
                    className={visibleMonths.reduce((s, mi) => s + (financingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}
                    loading={loading}
                    hasData={hasAnyData}
                    rawValue={visibleMonths.reduce((s, mi) => s + (financingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0)}
                    display={money(visibleMonths.reduce((s, mi) => s + (financingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                    onDrill={
                      merged
                        ? () => {
                            const totalVal = visibleMonths.reduce(
                              (s, mi) => s + (financingRowsByMonth[mi].find((r) => r.key === k)?.amount || 0),
                              0
                            );
                            const cat = statementKeyToTransactionCategory(k);
                            const tType = totalVal >= 0 ? 'income' : 'expense';
                            setDrill({
                              title: `Cash flow — ${rowLabelByKey[k] || k} (financing)`,
                              subtitle: `Total · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: cat,
                              type: cat ? null : tType,
                              statementAmount: totalVal,
                              sumMode: 'abs',
                            });
                          }
                        : undefined
                    }
                  />
                </tr>
              ))}
              <tr>
                <td><strong>Net Cash From Financing Activities</strong></td>
                {visibleMonths.map((mi) => {
                  const v = cols[mi].financing || 0;
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
                          title: 'Net cash from financing activities',
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
                  className={financing >= 0 ? 'pos' : 'neg'}
                  loading={loading}
                  hasData={hasAnyData}
                  rawValue={financing}
                  display={loading ? '…' : <strong>{hasAnyData ? money(financing) : ''}</strong>}
                  onDrill={
                    merged
                      ? () =>
                          setDrill({
                            title: 'Net cash from financing activities',
                            subtitle: `Total · ${quarterLabel} ${year} · all transactions in period`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: null,
                            statementAmount: financing,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash Summary</td></tr>
              <tr className="acct-ui-total-row">
                <td><strong>Net Change In Cash</strong></td>
                {visibleMonths.map((mi) => {
                  const v = cols[mi].netChange;
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
                          title: 'Net change in cash',
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
                  className={net >= 0 ? 'pos' : 'neg'}
                  loading={loading}
                  hasData={hasAnyData}
                  rawValue={net}
                  display={loading ? '…' : <strong>{hasAnyData ? money(net) : ''}</strong>}
                  onDrill={
                    merged
                      ? () =>
                          setDrill({
                            title: 'Net change in cash',
                            subtitle: `Total · ${quarterLabel} ${year} · all transactions in period`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: null,
                            statementAmount: net,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={visibleMonths.length + 2}>Cash And Cash Equivalents</td></tr>
              {cashAccountKeys.map((k) => (
                <tr key={`cash-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = cashAccountsByMonth[mi].find((r) => r.key === k)?.amount;
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    const tType = (Number(v) || 0) >= 0 ? 'income' : 'expense';
                    return (
                      <StatementAmountCell
                        key={mi}
                        className=""
                        loading={loading}
                        hasData={monthHasData[mi]}
                        rawValue={v}
                        display={monthHasData[mi] && v != null ? money(v) : ''}
                        onDrill={
                          cat
                            ? () =>
                                setDrill({
                                  title: `Cash flow — ${rowLabelByKey[k] || k}`,
                                  subtitle: `${MONTH_SHORT[mi]} ${year}`,
                                  start,
                                  end,
                                  category: cat,
                                  type: null,
                                  statementAmount: Number(v),
                                  sumMode: 'abs',
                                })
                            : () =>
                                setDrill({
                                  title: `Cash flow — ${rowLabelByKey[k] || k}`,
                                  subtitle: `${MONTH_SHORT[mi]} ${year}`,
                                  start,
                                  end,
                                  category: null,
                                  type: tType,
                                  statementAmount: Number(v),
                                  sumMode: 'abs',
                                })
                        }
                      />
                    );
                  })}
                  <StatementAmountCell
                    className=""
                    loading={loading}
                    hasData={hasAnyData}
                    rawValue={visibleMonths.reduce((s, mi) => s + (cashAccountsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0)}
                    display={money(visibleMonths.reduce((s, mi) => s + (cashAccountsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                    onDrill={
                      merged
                        ? () => {
                            const totalVal = visibleMonths.reduce(
                              (s, mi) => s + (cashAccountsByMonth[mi].find((r) => r.key === k)?.amount || 0),
                              0
                            );
                            const cat = statementKeyToTransactionCategory(k);
                            const tType = totalVal >= 0 ? 'income' : 'expense';
                            setDrill({
                              title: `Cash flow — ${rowLabelByKey[k] || k}`,
                              subtitle: `Total · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: cat,
                              type: cat ? null : tType,
                              statementAmount: totalVal,
                              sumMode: 'abs',
                            });
                          }
                        : undefined
                    }
                  />
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
