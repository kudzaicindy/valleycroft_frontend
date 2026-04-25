import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getCashflow } from '@/api/finance';
import FinanceLegacyReportsBanner from '@/components/dashboard/FinanceLegacyReportsBanner';
import StatementAmountCell from '@/components/dashboard/StatementAmountCell';
import StatementTransactionsModal from '@/components/dashboard/StatementTransactionsModal';
import { MONTH_SHORT, defaultReportYear, monthRange, yearOptions, yearRange } from '@/utils/financePeriods';
import { cashflowDetailedSections, unwrapFinancePayload } from '@/utils/financeStatementHelpers';
import {
  cashflowCashSectionAccountCodesUnion,
  cashflowDrillAccountCodes,
  mergedMonthRange,
  statementKeyToTransactionCategory,
} from '@/utils/statementDrilldown';

/** Reference-style: `R 6,495.00`, outflows `(R 100.00)`, empty months `--`, zero `-`. */
function cashflowStatementMoney(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num)) return '--';
  if (num === 0) return '-';
  const core = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const withSym = `R ${core}`;
  if (num < 0) return `(${withSym})`;
  return withSym;
}

function cashflowCellDisplay(value, monthHasData) {
  if (!monthHasData) return '--';
  if (value == null || value === '') return '--';
  return cashflowStatementMoney(Number(value));
}

function lastCashAccountBalanceInRange(visibleMonths, monthHasData, rowsByMonth, key) {
  for (let i = visibleMonths.length - 1; i >= 0; i--) {
    const mi = visibleMonths[i];
    if (!monthHasData[mi]) continue;
    const row = rowsByMonth[mi].find((r) => r.key === key);
    if (row && row.amount != null && row.amount !== '') return Number(row.amount);
  }
  return null;
}

/** Split detail line keys into inflows (net positive / only positive amounts) vs outflows. */
/** Drop lines that are entirely zero / empty across the visible months (removes noise rows). */
function keysWithAnyNonZeroActivity(keys, rowsByMonth, visibleMonths) {
  return keys.filter((k) =>
    visibleMonths.some((mi) => {
      const row = rowsByMonth[mi]?.find((r) => r.key === k);
      const v = row?.amount;
      return v != null && v !== '' && Number(v) !== 0 && !Number.isNaN(Number(v));
    })
  );
}

/** Hide repeated ending cash balance when net change is zero (API echoes same balance every month). */
function cashAccountAmountDisplay(mi, key, visibleMonths, monthHasData, rowsByMonth, netChangeByMonth) {
  if (!monthHasData[mi]) return { masked: true, display: '--', rawValue: null, drill: null };
  const row = rowsByMonth[mi].find((r) => r.key === key);
  const v = row?.amount;
  if (v == null || v === '') return { masked: true, display: '--', rawValue: null, drill: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { masked: true, display: '--', rawValue: null, drill: null };
  const idx = visibleMonths.indexOf(mi);
  let prevBal = null;
  for (let i = idx - 1; i >= 0; i--) {
    const pm = visibleMonths[i];
    if (!monthHasData[pm]) continue;
    const pr = rowsByMonth[pm].find((r) => r.key === key);
    if (pr?.amount == null || pr.amount === '') continue;
    prevBal = Number(pr.amount);
    break;
  }
  const nc = Number(netChangeByMonth[mi]);
  const netFlat = !Number.isFinite(nc) || Math.abs(nc) < 1e-9;
  if (prevBal != null && Number.isFinite(prevBal) && prevBal === n && netFlat) {
    return { masked: true, display: '--', rawValue: null, drill: null };
  }
  return { masked: false, display: cashflowStatementMoney(n), rawValue: v, drill: true };
}

function splitKeysByInflowOutflow(keys, rowsByMonth, visibleMonths) {
  const inflow = [];
  const outflow = [];
  for (const k of keys) {
    let sum = 0;
    let hasPos = false;
    let hasNeg = false;
    for (const mi of visibleMonths) {
      const v = rowsByMonth[mi]?.find((r) => r.key === k)?.amount;
      if (v == null || v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      sum += n;
      if (n > 0) hasPos = true;
      if (n < 0) hasNeg = true;
    }
    if (hasNeg && !hasPos) outflow.push(k);
    else if (hasPos && !hasNeg) inflow.push(k);
    else if (sum < 0) outflow.push(k);
    else inflow.push(k);
  }
  return [inflow, outflow];
}

function CashflowInvestFinDetailBlock({
  keys,
  idPrefix,
  subheadLabel,
  colSpan,
  rowsByMonth,
  rowLabelByKey,
  visibleMonths,
  monthHasData,
  loading,
  hasAnyData,
  merged,
  quarterLabel,
  year,
  setDrill,
  drillSuffix,
}) {
  if (!keys.length) return null;
  return (
    <>
      <tr className="acct-ui-cashflow-subhead">
        <td colSpan={colSpan}>{subheadLabel}</td>
      </tr>
      {keys.map((k) => (
        <tr key={`${idPrefix}-${k}`}>
          <td>{rowLabelByKey[k] || k}</td>
          {visibleMonths.map((mi) => {
            const v = rowsByMonth[mi].find((r) => r.key === k)?.amount;
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
                display={cashflowCellDisplay(v, monthHasData[mi])}
                emptyIncludesZero={false}
                onDrill={() =>
                  setDrill({
                    title: `Cash flow — ${rowLabelByKey[k] || k}${drillSuffix}`,
                    subtitle: `${MONTH_SHORT[mi]} ${year}`,
                    start,
                    end,
                    category: cat,
                    type: cat ? null : tType,
                    accountCodes: cashflowDrillAccountCodes(rowsByMonth, k, mi, visibleMonths, false),
                    statementAmount: Number(v),
                    sumMode: 'abs',
                  })
                }
              />
            );
          })}
          <StatementAmountCell
            className={visibleMonths.reduce((s, mi) => s + (rowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0) >= 0 ? 'pos' : 'neg'}
            loading={loading}
            hasData={hasAnyData}
            rawValue={visibleMonths.reduce((s, mi) => s + (rowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0)}
            display={cashflowStatementMoney(visibleMonths.reduce((s, mi) => s + (rowsByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
            emptyIncludesZero={false}
            onDrill={
              merged
                ? () => {
                    const totalVal = visibleMonths.reduce(
                      (s, mi) => s + (rowsByMonth[mi].find((r) => r.key === k)?.amount || 0),
                      0
                    );
                    const cat = statementKeyToTransactionCategory(k);
                    const tType = totalVal >= 0 ? 'income' : 'expense';
                    setDrill({
                      title: `Cash flow — ${rowLabelByKey[k] || k}${drillSuffix}`,
                      subtitle: `Total · ${quarterLabel} ${year}`,
                      start: merged.start,
                      end: merged.end,
                      category: cat,
                      type: cat ? null : tType,
                      accountCodes: cashflowDrillAccountCodes(rowsByMonth, k, null, visibleMonths, true),
                      statementAmount: totalVal,
                      sumMode: 'abs',
                    });
                  }
                : undefined
            }
          />
        </tr>
      ))}
    </>
  );
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
  const operatingIncomeKeys = keysWithAnyNonZeroActivity(
    Array.from(new Set(visibleMonths.flatMap((mi) => operatingIncomeByMonth[mi].map((r) => r.key)))),
    operatingIncomeByMonth,
    visibleMonths
  );
  const operatingExpenseKeys = keysWithAnyNonZeroActivity(
    Array.from(new Set(visibleMonths.flatMap((mi) => operatingExpenseByMonth[mi].map((r) => r.key)))),
    operatingExpenseByMonth,
    visibleMonths
  );
  const investingKeys = keysWithAnyNonZeroActivity(
    Array.from(new Set(visibleMonths.flatMap((mi) => investingRowsByMonth[mi].map((r) => r.key)))),
    investingRowsByMonth,
    visibleMonths
  );
  const financingKeys = keysWithAnyNonZeroActivity(
    Array.from(new Set(visibleMonths.flatMap((mi) => financingRowsByMonth[mi].map((r) => r.key)))),
    financingRowsByMonth,
    visibleMonths
  );
  const [investingInflowKeys, investingOutflowKeys] = splitKeysByInflowOutflow(investingKeys, investingRowsByMonth, visibleMonths);
  const [financingInflowKeys, financingOutflowKeys] = splitKeysByInflowOutflow(financingKeys, financingRowsByMonth, visibleMonths);
  const cashAccountKeys = Array.from(new Set(visibleMonths.flatMap((mi) => cashAccountsByMonth[mi].map((r) => r.key))));
  const cashSummaryAccountCodes = useMemo(
    () => cashflowCashSectionAccountCodesUnion(cashAccountsByMonth, visibleMonths),
    [cashAccountsByMonth, visibleMonths]
  );
  const rowLabelByKey = useMemo(() => {
    const map = {};
    [...operatingIncomeByMonth, ...operatingExpenseByMonth, ...investingRowsByMonth, ...financingRowsByMonth, ...cashAccountsByMonth].forEach((sectionRows) => {
      sectionRows.forEach((r) => {
        if (!map[r.key]) map[r.key] = r.label;
      });
    });
    return map;
  }, [operatingIncomeByMonth, operatingExpenseByMonth, investingRowsByMonth, financingRowsByMonth, cashAccountsByMonth]);

  const incomeSumByMonth = cols.map((c) => c.operatingIncome.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const expenseSumByMonth = cols.map((c) => c.operatingExpense.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const operatingNetFromLinesByMonth = cols.map((c, mi) => {
    if (c.operatingIncome.length || c.operatingExpense.length) {
      return incomeSumByMonth[mi] + expenseSumByMonth[mi];
    }
    return c.operating;
  });
  const investingSumByMonth = cols.map((c) => c.investingRows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const investingNetByMonth = cols.map((c, mi) => (c.investingRows.length ? investingSumByMonth[mi] : c.investing));
  const financingSumByMonth = cols.map((c) => c.financingRows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const financingNetByMonth = cols.map((c, mi) => (c.financingRows.length ? financingSumByMonth[mi] : c.financing));

  const operating = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? operatingNetFromLinesByMonth[mi] : 0), 0);
  const operatingIncomeTotal = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? incomeSumByMonth[mi] : 0), 0);
  const investing = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? investingNetByMonth[mi] : 0), 0);
  const financing = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? financingNetByMonth[mi] : 0), 0);
  const netChangeByMonth = cols.map((c, mi) => {
    const nc = c.netChange;
    if (nc != null && Number.isFinite(Number(nc))) return Number(nc);
    return operatingNetFromLinesByMonth[mi] + investingNetByMonth[mi] + financingNetByMonth[mi];
  });
  const net = visibleMonths.reduce((s, mi) => s + (monthHasData[mi] ? netChangeByMonth[mi] : 0), 0);

  const firstMiWithData = visibleMonths.find((mi) => monthHasData[mi]);
  const lastMiWithData = [...visibleMonths].reverse().find((mi) => monthHasData[mi]);
  const openingCash =
    firstMiWithData != null
      ? (() => {
          const o = cols[firstMiWithData].openingCash;
          const num = Number(o);
          return Number.isFinite(num) ? num : 0;
        })()
      : 0;
  const closingCash =
    lastMiWithData != null
      ? (() => {
          const c = cols[lastMiWithData].closingCash;
          const num = Number(c);
          return Number.isFinite(num) ? num : openingCash + net;
        })()
      : openingCash + net;
  const hasAnyData = visibleMonths.some((mi) => monthHasData[mi]);
  const merged = useMemo(() => mergedMonthRange(year, visibleMonths), [year, visibleMonths]);
  const quarterLabel = QUARTERS.find((q) => q.value === quarter)?.label ?? '';

  const statementMeta = useMemo(() => {
    for (const q of monthQueries) {
      if (!q.data) continue;
      const d = unwrapFinancePayload(q.data);
      if (d && typeof d === 'object' && (d.basis != null || d.period != null)) {
        return {
          basis: d.basis != null ? String(d.basis) : null,
          period: d.period != null ? String(d.period) : null,
        };
      }
    }
    return { basis: null, period: null };
  }, [monthQueries]);

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

      <div className="acct-ui-meta">
        Year: {year} · Quarter: {QUARTERS.find((q) => q.value === quarter)?.label} · Entity: All Entities
        {statementMeta.basis ? <> · Basis: {statementMeta.basis}</> : null}
        {statementMeta.period ? <> · Period: {statementMeta.period}</> : null}
      </div>
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

      <div className="card finance-stmt-card acct-ui-table-card acct-ui-table-card--cashflow">
        <div className="card-body card-body--no-pad acct-ui-table-scroll">
          <table className="acct-ui-table acct-ui-table--cashflow-statement">
            <thead>
              <tr>
                <th className="acct-ui-th-desc">Description</th>
                {visibleMonths.map((mi) => (
                  <th key={mi} className="acct-ui-th-month">
                    {MONTH_SHORT[mi]} {String(year).slice(-2)}
                  </th>
                ))}
                <th className="acct-ui-th-total">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="acct-ui-section acct-ui-section--neutral acct-ui-section--cashflow">
                <td colSpan={visibleMonths.length + 2}>Cash flows from operating activities</td>
              </tr>
              <tr className="acct-ui-cashflow-subhead">
                <td colSpan={visibleMonths.length + 2}>Operating inflows</td>
              </tr>
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
                        display={cashflowCellDisplay(v, monthHasData[mi])}
                        emptyIncludesZero={false}
                        onDrill={() =>
                          setDrill({
                            title: `Cash flow — ${rowLabelByKey[k] || k}`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: 'income',
                            accountCodes: cashflowDrillAccountCodes(operatingIncomeByMonth, k, mi, visibleMonths, false),
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
                    display={cashflowStatementMoney(visibleMonths.reduce((s, mi) => s + (operatingIncomeByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                    emptyIncludesZero={false}
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
                              accountCodes: cashflowDrillAccountCodes(operatingIncomeByMonth, k, null, visibleMonths, true),
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
                <td><strong>Total operating income</strong></td>
                {visibleMonths.map((mi) => {
                  const v = incomeSumByMonth[mi];
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : <strong>{monthHasData[mi] ? cashflowStatementMoney(v) : '--'}</strong>}
                      emptyIncludesZero={false}
                      onDrill={() =>
                        setDrill({
                          title: 'Total operating income (cash)',
                          subtitle: `${MONTH_SHORT[mi]} ${year}`,
                          start,
                          end,
                          category: null,
                          type: null,
                          accountCodes: cashSummaryAccountCodes,
                          statementAmount: v,
                          sumMode: 'signed',
                        })
                      }
                    />
                  );
                })}
                <StatementAmountCell
                  className={operatingIncomeTotal >= 0 ? 'pos' : 'neg'}
                  loading={loading}
                  hasData={hasAnyData}
                  rawValue={operatingIncomeTotal}
                  display={loading ? '…' : <strong>{hasAnyData ? cashflowStatementMoney(operatingIncomeTotal) : '--'}</strong>}
                  emptyIncludesZero={false}
                  onDrill={
                    merged
                      ? () => {
                          const tv = operatingIncomeTotal;
                          setDrill({
                            title: 'Total operating income (cash)',
                            subtitle: `Total · ${quarterLabel} ${year}`,
                            start: merged.start,
                            end: merged.end,
                            category: null,
                            type: null,
                            accountCodes: cashSummaryAccountCodes,
                            statementAmount: tv,
                            sumMode: 'signed',
                          });
                        }
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-cashflow-subhead">
                <td colSpan={visibleMonths.length + 2}>Operating outflows</td>
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
                        display={cashflowCellDisplay(v, monthHasData[mi])}
                        emptyIncludesZero={false}
                        onDrill={() =>
                          setDrill({
                            title: `Cash flow — ${rowLabelByKey[k] || k}`,
                            subtitle: `${MONTH_SHORT[mi]} ${year}`,
                            start,
                            end,
                            category: cat,
                            type: 'expense',
                            accountCodes: cashflowDrillAccountCodes(operatingExpenseByMonth, k, mi, visibleMonths, false),
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
                    display={cashflowStatementMoney(visibleMonths.reduce((s, mi) => s + (operatingExpenseByMonth[mi].find((r) => r.key === k)?.amount || 0), 0))}
                    emptyIncludesZero={false}
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
                              accountCodes: cashflowDrillAccountCodes(operatingExpenseByMonth, k, null, visibleMonths, true),
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
                <td><strong>Total operating expenses</strong></td>
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
                      display={loading ? '…' : <strong>{monthHasData[mi] ? cashflowStatementMoney(v) : '--'}</strong>}
                      emptyIncludesZero={false}
                      onDrill={() =>
                        setDrill({
                          title: 'Total operating expenses (cash)',
                          subtitle: `${MONTH_SHORT[mi]} ${year}`,
                          start,
                          end,
                          category: null,
                          type: 'expense',
                          accountCodes: cashSummaryAccountCodes,
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
                        {cashflowStatementMoney(visibleMonths.reduce((s, mi) => s + operatingExpenseByMonth[mi].reduce((a, r) => a + r.amount, 0), 0))}
                      </strong>
                    )
                  }
                  emptyIncludesZero={false}
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
                            accountCodes: cashSummaryAccountCodes,
                            statementAmount: tv,
                            sumMode: 'abs',
                          });
                        }
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-total-row">
                <td><strong>Net cash from operating activities</strong></td>
                {visibleMonths.map((mi) => {
                  const v = operatingNetFromLinesByMonth[mi];
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : monthHasData[mi] ? cashflowStatementMoney(v) : '--'}
                      emptyIncludesZero={false}
                      onDrill={() =>
                        setDrill({
                          title: 'Net cash from operating activities',
                          subtitle: `${MONTH_SHORT[mi]} ${year} · all transactions in period`,
                          start,
                          end,
                          category: null,
                          type: null,
                          accountCodes: cashSummaryAccountCodes,
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
                  display={loading ? '…' : <strong>{hasAnyData ? cashflowStatementMoney(operating) : '--'}</strong>}
                  emptyIncludesZero={false}
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
                            accountCodes: cashSummaryAccountCodes,
                            statementAmount: operating,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral acct-ui-section--cashflow">
                <td colSpan={visibleMonths.length + 2}>Cash flows from investing activities</td>
              </tr>
              <CashflowInvestFinDetailBlock
                keys={investingInflowKeys}
                idPrefix="inv-in"
                subheadLabel="Investing inflows"
                colSpan={visibleMonths.length + 2}
                rowsByMonth={investingRowsByMonth}
                rowLabelByKey={rowLabelByKey}
                visibleMonths={visibleMonths}
                monthHasData={monthHasData}
                loading={loading}
                hasAnyData={hasAnyData}
                merged={merged}
                quarterLabel={quarterLabel}
                year={year}
                setDrill={setDrill}
                drillSuffix=" (investing)"
              />
              <CashflowInvestFinDetailBlock
                keys={investingOutflowKeys}
                idPrefix="inv-out"
                subheadLabel="Investing outflows"
                colSpan={visibleMonths.length + 2}
                rowsByMonth={investingRowsByMonth}
                rowLabelByKey={rowLabelByKey}
                visibleMonths={visibleMonths}
                monthHasData={monthHasData}
                loading={loading}
                hasAnyData={hasAnyData}
                merged={merged}
                quarterLabel={quarterLabel}
                year={year}
                setDrill={setDrill}
                drillSuffix=" (investing)"
              />
              <tr>
                <td><strong>Net cash from investing activities</strong></td>
                {visibleMonths.map((mi) => {
                  const v = investingNetByMonth[mi];
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : monthHasData[mi] ? cashflowStatementMoney(v) : '--'}
                      emptyIncludesZero={false}
                      onDrill={() =>
                        setDrill({
                          title: 'Net cash from investing activities',
                          subtitle: `${MONTH_SHORT[mi]} ${year} · all transactions in period`,
                          start,
                          end,
                          category: null,
                          type: null,
                          accountCodes: cashSummaryAccountCodes,
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
                  display={loading ? '…' : <strong>{hasAnyData ? cashflowStatementMoney(investing) : '--'}</strong>}
                  emptyIncludesZero={false}
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
                            accountCodes: cashSummaryAccountCodes,
                            statementAmount: investing,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral acct-ui-section--cashflow">
                <td colSpan={visibleMonths.length + 2}>Cash flows from financing activities</td>
              </tr>
              <CashflowInvestFinDetailBlock
                keys={financingInflowKeys}
                idPrefix="fin-in"
                subheadLabel="Financing inflows"
                colSpan={visibleMonths.length + 2}
                rowsByMonth={financingRowsByMonth}
                rowLabelByKey={rowLabelByKey}
                visibleMonths={visibleMonths}
                monthHasData={monthHasData}
                loading={loading}
                hasAnyData={hasAnyData}
                merged={merged}
                quarterLabel={quarterLabel}
                year={year}
                setDrill={setDrill}
                drillSuffix=" (financing)"
              />
              <CashflowInvestFinDetailBlock
                keys={financingOutflowKeys}
                idPrefix="fin-out"
                subheadLabel="Financing outflows"
                colSpan={visibleMonths.length + 2}
                rowsByMonth={financingRowsByMonth}
                rowLabelByKey={rowLabelByKey}
                visibleMonths={visibleMonths}
                monthHasData={monthHasData}
                loading={loading}
                hasAnyData={hasAnyData}
                merged={merged}
                quarterLabel={quarterLabel}
                year={year}
                setDrill={setDrill}
                drillSuffix=" (financing)"
              />
              <tr>
                <td><strong>Net cash from financing activities</strong></td>
                {visibleMonths.map((mi) => {
                  const v = financingNetByMonth[mi];
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : monthHasData[mi] ? cashflowStatementMoney(v) : '--'}
                      emptyIncludesZero={false}
                      onDrill={() =>
                        setDrill({
                          title: 'Net cash from financing activities',
                          subtitle: `${MONTH_SHORT[mi]} ${year} · all transactions in period`,
                          start,
                          end,
                          category: null,
                          type: null,
                          accountCodes: cashSummaryAccountCodes,
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
                  display={loading ? '…' : <strong>{hasAnyData ? cashflowStatementMoney(financing) : '--'}</strong>}
                  emptyIncludesZero={false}
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
                            accountCodes: cashSummaryAccountCodes,
                            statementAmount: financing,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral acct-ui-section--cashflow">
                <td colSpan={visibleMonths.length + 2}>Cash summary</td>
              </tr>
              <tr className="acct-ui-total-row">
                <td><strong>Net change in cash</strong></td>
                {visibleMonths.map((mi) => {
                  const v = netChangeByMonth[mi];
                  const { start, end } = monthRange(year, mi);
                  return (
                    <StatementAmountCell
                      key={mi}
                      className={v >= 0 ? 'pos' : 'neg'}
                      loading={loading}
                      hasData={monthHasData[mi]}
                      rawValue={v}
                      display={loading ? '…' : monthHasData[mi] ? cashflowStatementMoney(v) : '--'}
                      emptyIncludesZero={false}
                      onDrill={() =>
                        setDrill({
                          title: 'Net change in cash',
                          subtitle: `${MONTH_SHORT[mi]} ${year} · all transactions in period`,
                          start,
                          end,
                          category: null,
                          type: null,
                          accountCodes: cashSummaryAccountCodes,
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
                  display={loading ? '…' : <strong>{hasAnyData ? cashflowStatementMoney(net) : '--'}</strong>}
                  emptyIncludesZero={false}
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
                            accountCodes: cashSummaryAccountCodes,
                            statementAmount: net,
                            sumMode: 'signed',
                          })
                      : undefined
                  }
                />
              </tr>
              <tr className="acct-ui-section acct-ui-section--neutral acct-ui-section--cashflow">
                <td colSpan={visibleMonths.length + 2}>Cash and cash equivalents</td>
              </tr>
              {cashAccountKeys.map((k) => {
                const lastBal = lastCashAccountBalanceInRange(visibleMonths, monthHasData, cashAccountsByMonth, k);
                return (
                <tr key={`cash-${k}`}>
                  <td>{rowLabelByKey[k] || k}</td>
                  {visibleMonths.map((mi) => {
                    const v = cashAccountsByMonth[mi].find((r) => r.key === k)?.amount;
                    const cat = statementKeyToTransactionCategory(k);
                    const { start, end } = monthRange(year, mi);
                    const tType = (Number(v) || 0) >= 0 ? 'income' : 'expense';
                    const cell = cashAccountAmountDisplay(mi, k, visibleMonths, monthHasData, cashAccountsByMonth, netChangeByMonth);
                    return (
                      <StatementAmountCell
                        key={mi}
                        className=""
                        loading={loading}
                        hasData={monthHasData[mi] && !cell.masked}
                        rawValue={cell.masked ? null : v}
                        display={loading ? '…' : cell.display}
                        emptyIncludesZero={false}
                        onDrill={
                          cell.masked
                            ? undefined
                            : cat
                              ? () =>
                                  setDrill({
                                    title: `Cash flow — ${rowLabelByKey[k] || k}`,
                                    subtitle: `${MONTH_SHORT[mi]} ${year}`,
                                    start,
                                    end,
                                    category: cat,
                                    type: null,
                                    accountCodes: cashflowDrillAccountCodes(cashAccountsByMonth, k, mi, visibleMonths, false),
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
                                    accountCodes: cashflowDrillAccountCodes(cashAccountsByMonth, k, mi, visibleMonths, false),
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
                    hasData={hasAnyData && lastBal != null}
                    rawValue={lastBal != null ? lastBal : null}
                    display={lastBal != null ? cashflowStatementMoney(lastBal) : '--'}
                    emptyIncludesZero={false}
                    onDrill={
                      merged && lastBal != null
                        ? () => {
                            const cat = statementKeyToTransactionCategory(k);
                            const tType = lastBal >= 0 ? 'income' : 'expense';
                            setDrill({
                              title: `Cash flow — ${rowLabelByKey[k] || k}`,
                              subtitle: `Ending balance · ${quarterLabel} ${year}`,
                              start: merged.start,
                              end: merged.end,
                              category: cat,
                              type: cat ? null : tType,
                              accountCodes: cashflowDrillAccountCodes(cashAccountsByMonth, k, null, visibleMonths, true),
                              statementAmount: lastBal,
                              sumMode: 'abs',
                            });
                          }
                        : undefined
                    }
                  />
                </tr>
                );
              })}
              <tr>
                <td>Cash at beginning of period</td>
                {visibleMonths.map((mi) => (
                  <td key={mi} className="num">
                    {loading ? '…' : monthHasData[mi] ? cashflowStatementMoney(cols[mi].openingCash) : '--'}
                  </td>
                ))}
                <td className="num">{loading ? '…' : hasAnyData ? cashflowStatementMoney(openingCash) : '--'}</td>
              </tr>
              <tr className="acct-ui-total-row">
                <td><strong>Cash at end of period</strong></td>
                {visibleMonths.map((mi) => (
                  <td key={mi} className="num">
                    <strong>{loading ? '…' : monthHasData[mi] ? cashflowStatementMoney(cols[mi].closingCash) : '--'}</strong>
                  </td>
                ))}
                <td className="num">
                  <strong>{loading ? '…' : hasAnyData ? cashflowStatementMoney(closingCash) : '--'}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
