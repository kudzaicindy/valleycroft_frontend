import { Fragment, useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBalanceSheet } from '@/api/finance';
import FinanceLegacyReportsBanner from '@/components/dashboard/FinanceLegacyReportsBanner';
import { MONTH_SHORT, defaultReportYear, endOfMonthDate, yearOptions } from '@/utils/financePeriods';
import {
  groupBalanceSheetItems,
  normalizeBalanceSheetRows,
  readBalanceSheetSectionTotal,
  rowLabel,
  sumBalanceSheetLines,
} from '@/utils/financeStatementHelpers';

function money(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num) || num === 0) return '-';
  return num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneySigned(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num) || num === 0) return '-';
  const abs = Math.abs(num).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num < 0) return `(${abs})`;
  return abs;
}

function sectionHeaderClass(key) {
  if (key === 'assets') return 'acct-ui-section acct-ui-section--pos';
  if (key === 'liabilities') return 'acct-ui-section acct-ui-section--neg';
  if (key === 'equity') return 'acct-ui-section acct-ui-section--equity';
  return 'acct-ui-section acct-ui-section--neutral';
}

export default function BalanceSheet() {
  const [year, setYear] = useState(defaultReportYear);
  const [monthIndex, setMonthIndex] = useState(() => new Date().getMonth());
  const [entity, setEntity] = useState('all');
  const years = useMemo(() => yearOptions({ back: 8, forward: 1 }), []);

  const asAt = useMemo(() => endOfMonthDate(year, monthIndex), [year, monthIndex]);
  const { data, isLoading, error } = useQuery({
    queryKey: ['finance', 'balance-sheet', asAt],
    queryFn: () => getBalanceSheet({ end: asAt, asAt, date: asAt }),
  });

  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const asAtLabel = payload.asAt || asAt;

  const rawItems = useMemo(() => normalizeBalanceSheetRows(data), [data]);
  const groups = useMemo(() => groupBalanceSheetItems(rawItems), [rawItems]);

  const apiSectionTotals = useMemo(
    () => ({
      assets: readBalanceSheetSectionTotal(payload.assets),
      liabilities: readBalanceSheetSectionTotal(payload.liabilities),
      equity: readBalanceSheetSectionTotal(payload.equity),
    }),
    [payload.assets, payload.liabilities, payload.equity]
  );

  const sectionTotal = useCallback(
    (g) => {
      const fromApi =
        g.key === 'assets'
          ? apiSectionTotals.assets
          : g.key === 'liabilities'
            ? apiSectionTotals.liabilities
            : g.key === 'equity'
              ? apiSectionTotals.equity
              : null;
      if (fromApi != null) return fromApi;
      return sumBalanceSheetLines(g.rows);
    },
    [apiSectionTotals]
  );

  const assetsTotal = useMemo(() => {
    const g = groups.find((x) => x.key === 'assets');
    return g ? sectionTotal(g) : apiSectionTotals.assets ?? 0;
  }, [groups, sectionTotal, apiSectionTotals.assets]);

  const liabilitiesTotal = useMemo(() => {
    const g = groups.find((x) => x.key === 'liabilities');
    return g ? sectionTotal(g) : apiSectionTotals.liabilities ?? 0;
  }, [groups, sectionTotal, apiSectionTotals.liabilities]);

  const equityTotal = useMemo(() => {
    const g = groups.find((x) => x.key === 'equity');
    return g ? sectionTotal(g) : apiSectionTotals.equity ?? 0;
  }, [groups, sectionTotal, apiSectionTotals.equity]);

  const rightside = liabilitiesTotal + equityTotal;
  const difference = assetsTotal - rightside;
  const balanced = Math.abs(difference) < 0.005;

  const colCount = 5;

  return (
    <div className="finance-statement-page acct-ui-page acct-ui-page--balance-sheet">
      <FinanceLegacyReportsBanner />

      <div className="acct-ui-topbar">
        <div className="acct-ui-topbar-title-wrap">
          <div className="acct-ui-topbar-title">Statement of financial position</div>
          <div className="acct-ui-topbar-sub">Balance sheet — assets, liabilities, and equity as at the period end</div>
        </div>
        <div className="acct-ui-controls">
          <label>Year
            <select className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>Month
            <select className="form-control" value={monthIndex} onChange={(e) => setMonthIndex(Number(e.target.value))}>
              {MONTH_SHORT.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </label>
          <label>Entity
            <select className="form-control" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="all">All Entities</option>
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}><i className="fas fa-download" /> Export</button>
        </div>
      </div>

      <div className="acct-ui-meta acct-ui-meta--balance">
        <span>As at: <strong>{asAtLabel}</strong></span>
        <span className="acct-ui-meta-sep">·</span>
        <span>Year: {year} · {MONTH_SHORT[monthIndex]} {String(year).slice(-2)}</span>
        <span className={`acct-ui-balance-flag ${balanced ? 'ok' : 'bad'}`}>{balanced ? 'Balanced' : 'Out of balance'}</span>
      </div>

      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      <div className="card finance-stmt-card acct-ui-table-card">
        <div className="card-body card-body--no-pad">
          <div className="acct-ui-table-wrap">
            <table className="acct-ui-table acct-ui-table--balance acct-ui-table--balance-sheet">
              <thead>
                <tr>
                  <th className="acct-ui-th-code">Code</th>
                  <th className="acct-ui-th-account">Account</th>
                  <th className="acct-ui-th-cat">Category</th>
                  <th className="acct-ui-th-type">Type</th>
                  <th className="num acct-ui-th-amt">Amount ({MONTH_SHORT[monthIndex].slice(0, 3)} {String(year).slice(-2)})</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={colCount}>Loading…</td></tr>}
                {!isLoading && groups.length === 0 && <tr><td colSpan={colCount}>No data</td></tr>}
                {!isLoading &&
                  groups.map((g) => (
                    <Fragment key={g.key}>
                      <tr className={sectionHeaderClass(g.key)}>
                        <td colSpan={colCount}>{g.label}</td>
                      </tr>
                      {g.rows.map((row, idx) => (
                        <tr
                          key={`${g.key}-${idx}`}
                          className={row._bsSubtotal ? 'acct-ui-bs-subtotal-row' : ''}
                        >
                          <td className="acct-ui-td-code">{row.code || row.accountCode || '—'}</td>
                          <td className="acct-ui-td-account">{rowLabel(row)}</td>
                          <td className="acct-ui-td-muted">{row.category || row.group || '—'}</td>
                          <td className="acct-ui-td-muted">{row.type || row.section || '—'}</td>
                          <td className="num">{money(row.amount ?? row.value ?? null)}</td>
                        </tr>
                      ))}
                      <tr className="acct-ui-section-total-row">
                        <td colSpan={4}>
                          <strong>Total {g.label}</strong>
                        </td>
                        <td className="num"><strong>{money(sectionTotal(g))}</strong></td>
                      </tr>
                    </Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`card acct-ui-balance-formula ${balanced ? 'is-balanced' : 'is-not-balanced'}`}>
        <div className="acct-ui-balance-formula-inner">
          <div className="acct-ui-balance-formula-title">
            <i className="fas fa-equals" aria-hidden /> Accounting equation
          </div>
          <p className="acct-ui-balance-formula-desc">Assets must equal liabilities plus equity (for every balance sheet).</p>
          <div className="acct-ui-balance-formula-eq" role="math">
            <span className="acct-ui-formula-term">
              <span className="acct-ui-formula-label">Assets</span>
              <span className="acct-ui-formula-val">{money(assetsTotal)}</span>
            </span>
            <span className="acct-ui-formula-op" aria-hidden>=</span>
            <span className="acct-ui-formula-term">
              <span className="acct-ui-formula-label">Liabilities</span>
              <span className="acct-ui-formula-val">{money(liabilitiesTotal)}</span>
            </span>
            <span className="acct-ui-formula-op" aria-hidden>+</span>
            <span className="acct-ui-formula-term">
              <span className="acct-ui-formula-label">Equity</span>
              <span className="acct-ui-formula-val">{money(equityTotal)}</span>
            </span>
          </div>
          <div className="acct-ui-balance-formula-check">
            <span className="acct-ui-formula-label">Check: Assets − (Liabilities + Equity)</span>
            <span className={`acct-ui-formula-diff ${balanced ? 'ok' : 'bad'}`}>{moneySigned(difference)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
