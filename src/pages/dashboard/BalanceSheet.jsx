import { Fragment, useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBalanceSheet } from '@/api/finance';
import FinanceLegacyReportsBanner from '@/components/dashboard/FinanceLegacyReportsBanner';
import StatementAmountCell from '@/components/dashboard/StatementAmountCell';
import StatementTransactionsModal from '@/components/dashboard/StatementTransactionsModal';
import { MONTH_SHORT, defaultReportYear, endOfMonthDate, monthRange, yearOptions } from '@/utils/financePeriods';
import { balanceSheetLineAccountCodes } from '@/utils/statementDrilldown';
import {
  groupBalanceSheetItems,
  normalizeBalanceSheetRows,
  readBalanceSheetSectionTotal,
  readDoubleEntryBalanceSheetTotals,
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

function mapSectionRows(sectionKey, sectionLabel, rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((line) => {
      if (!line || typeof line !== 'object') return null;
      return {
        section: sectionLabel,
        group: sectionLabel,
        type: line.accountType || line.account_type || sectionKey,
        subtype: line.subType || line.sub_type || line.accountSubType || line.account_sub_type || line.accountType || line.account_type || sectionKey,
        code: String(line.accountCode ?? line.account_code ?? line.code ?? ''),
        accountName: String(line.accountName ?? line.account_name ?? line.name ?? '—'),
        name: String(line.accountName ?? line.account_name ?? line.name ?? '—'),
        category: line.subType || line.sub_type || line.accountSubType || line.account_sub_type || line.accountType || line.account_type || sectionKey,
        amount: Number(line.balance ?? line.amount ?? line.value ?? 0) || 0,
      };
    })
    .filter(Boolean);
}

export default function BalanceSheet() {
  const [year, setYear] = useState(defaultReportYear);
  const [monthIndex, setMonthIndex] = useState(() => new Date().getMonth());
  const [entity, setEntity] = useState('all');
  const [drill, setDrill] = useState(null);
  const years = useMemo(() => yearOptions({ back: 8, forward: 1 }), []);

  const asAt = useMemo(() => endOfMonthDate(year, monthIndex), [year, monthIndex]);
  const { data, isLoading, error } = useQuery({
    queryKey: ['finance', 'balance-sheet', asAt],
    queryFn: () => getBalanceSheet({ end: asAt, asAt, date: asAt }),
  });

  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const reportPayload = useMemo(() => {
    const d = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : null;
    const candidates = [
      d?.accounting,
      payload?.accounting,
      d,
      payload,
    ].filter((x) => x && typeof x === 'object' && !Array.isArray(x));

    function hasRenderableBalanceSheetShape(x) {
      if (!x || typeof x !== 'object') return false;
      if (Array.isArray(x.assets) || Array.isArray(x.liabilities) || Array.isArray(x.equity)) return true;
      if (x.presentation && typeof x.presentation === 'object' && Array.isArray(x.presentation.sections)) return true;
      return false;
    }

    return candidates.find(hasRenderableBalanceSheetShape) || candidates[0] || {};
  }, [payload]);

  const asAtLabel =
    reportPayload.asAt ||
    (reportPayload.presentation && typeof reportPayload.presentation === 'object' ? reportPayload.presentation.asAt : null) ||
    asAt;

  const statementTitle =
    (reportPayload.presentation && typeof reportPayload.presentation === 'object' && reportPayload.presentation.statementTitle) ||
    reportPayload.statementName ||
    'Statement of financial position';

  const presentationGroups = useMemo(() => {
    const sections =
      reportPayload.presentation &&
      typeof reportPayload.presentation === 'object' &&
      Array.isArray(reportPayload.presentation.sections)
        ? reportPayload.presentation.sections
        : [];
    if (!sections.length) return [];
    return sections.map((sec) => {
      const rawKey = String(sec?.key || '').toLowerCase();
      const key =
        rawKey === 'assets' || rawKey === 'liabilities' || rawKey === 'equity'
          ? rawKey
          : (/asset/.test(rawKey) ? 'assets' : /liabilit/.test(rawKey) ? 'liabilities' : /equit/.test(rawKey) ? 'equity' : rawKey || 'other');
      const rows = Array.isArray(sec?.lines)
        ? sec.lines.map((line) => ({
            section: sec.label || key,
            group: sec.label || key,
            type: line?.accountType || key,
            subtype: line?.subType || line?.sub_type || line?.accountSubType || line?.account_sub_type || line?.accountType || key,
            code: String(line?.accountCode ?? line?.code ?? ''),
            accountName: String(line?.accountName ?? line?.name ?? '—'),
            name: String(line?.accountName ?? line?.name ?? '—'),
            category: line?.subType || line?.sub_type || line?.accountSubType || line?.account_sub_type || line?.accountType || key,
            amount: Number(line?.balance ?? line?.amount ?? line?.value ?? 0) || 0,
          }))
        : [];
      return { key, label: sec?.label || key, rows, total: Number(sec?.total ?? 0) || 0 };
    });
  }, [reportPayload]);

  const rawItems = useMemo(() => {
    const normalized = normalizeBalanceSheetRows(reportPayload);
    if (Array.isArray(normalized) && normalized.length > 0) return normalized;
    // Hard fallback for payloads that still carry explicit section arrays.
    return [
      ...mapSectionRows('assets', 'Assets', reportPayload.assets),
      ...mapSectionRows('liabilities', 'Liabilities', reportPayload.liabilities),
      ...mapSectionRows('equity', 'Owner\'s equity', reportPayload.equity),
    ];
  }, [reportPayload]);
  const normalizedGroups = useMemo(() => groupBalanceSheetItems(rawItems), [rawItems]);
  const groups = presentationGroups.length > 0 ? presentationGroups : normalizedGroups;

  const apiSectionTotals = useMemo(() => {
    const flat =
      readDoubleEntryBalanceSheetTotals(reportPayload) ||
      readDoubleEntryBalanceSheetTotals(
        reportPayload.presentation && typeof reportPayload.presentation === 'object' ? reportPayload.presentation : null
      );
    if (flat && (flat.assets != null || flat.liabilities != null || flat.equity != null)) {
      return {
        assets: flat.assets,
        liabilities: flat.liabilities,
        equity: flat.equity,
      };
    }
    return {
      assets: readBalanceSheetSectionTotal(reportPayload.assets),
      liabilities: readBalanceSheetSectionTotal(reportPayload.liabilities),
      equity: readBalanceSheetSectionTotal(reportPayload.equity),
    };
  }, [reportPayload]);

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
      if (g.total != null && Number.isFinite(Number(g.total))) return Number(g.total);
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

  const equationFromApi =
    reportPayload.equation && typeof reportPayload.equation === 'object'
      ? reportPayload.equation
      : reportPayload.presentation && typeof reportPayload.presentation === 'object' && reportPayload.presentation.equation
        ? reportPayload.presentation.equation
        : null;
  const rightside = liabilitiesTotal + equityTotal;
  const computedDifference = assetsTotal - rightside;
  const difference =
    equationFromApi && equationFromApi.difference != null ? Number(equationFromApi.difference) || 0 : computedDifference;
  const balanced =
    equationFromApi && equationFromApi.balanced != null
      ? Boolean(equationFromApi.balanced)
      : Math.abs(difference) < 0.005;

  const colCount = 5;
  const drillMonthRange = useMemo(() => monthRange(year, monthIndex), [year, monthIndex]);
  const tableHasData = !isLoading && groups.length > 0;

  return (
    <div className="finance-statement-page acct-ui-page acct-ui-page--balance-sheet">
      <FinanceLegacyReportsBanner />

      <div className="acct-ui-topbar">
        <div className="acct-ui-topbar-title-wrap">
          <div className="acct-ui-topbar-title">{statementTitle}</div>
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
                      {g.rows.map((row, idx) => {
                        const amt = row.amount ?? row.value ?? null;
                        const acctCodes = balanceSheetLineAccountCodes(row);
                        const label = row.accountName || row.name || rowLabel(row);
                        return (
                          <tr
                            key={`${g.key}-${idx}`}
                            className={row._bsSubtotal ? 'acct-ui-bs-subtotal-row' : ''}
                          >
                            <td className="acct-ui-td-code">{row.code || row.accountCode || '—'}</td>
                            <td className="acct-ui-td-account">{label}</td>
                            <td className="acct-ui-td-muted">{row.subtype || row.type || row.category || row.group || '—'}</td>
                            <td className="acct-ui-td-muted">{row.type || row.section || '—'}</td>
                            <StatementAmountCell
                              alignClass="num"
                              loading={isLoading}
                              hasData={tableHasData}
                              rawValue={amt}
                              display={money(amt)}
                              emptyIncludesZero={false}
                              onDrill={
                                row._bsSubtotal || !acctCodes.length
                                  ? undefined
                                  : () =>
                                      setDrill({
                                        title: `Balance sheet — ${label}`,
                                        subtitle: `${MONTH_SHORT[monthIndex]} ${year} · code ${acctCodes.join(', ')}`,
                                        start: drillMonthRange.start,
                                        end: drillMonthRange.end,
                                        category: null,
                                        type: null,
                                        accountCodes: acctCodes,
                                        statementAmount: Number(amt) || 0,
                                        sumMode: 'abs',
                                      })
                              }
                            />
                          </tr>
                        );
                      })}
                      <tr className="acct-ui-section-total-row">
                        <td colSpan={4}>
                          <strong>Total {g.label}</strong>
                        </td>
                        <StatementAmountCell
                          alignClass="num"
                          className=""
                          loading={isLoading}
                          hasData={tableHasData}
                          rawValue={sectionTotal(g)}
                          display={<strong>{money(sectionTotal(g))}</strong>}
                          emptyIncludesZero={false}
                          onDrill={
                            tableHasData
                              ? () =>
                                  setDrill({
                                    title: `Balance sheet — Total ${g.label}`,
                                    subtitle: `All accounts · ${MONTH_SHORT[monthIndex]} ${year}`,
                                    start: drillMonthRange.start,
                                    end: drillMonthRange.end,
                                    category: null,
                                    type: null,
                                    accountCodes: null,
                                    statementAmount: sectionTotal(g),
                                    sumMode: 'signed',
                                  })
                              : undefined
                          }
                        />
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
