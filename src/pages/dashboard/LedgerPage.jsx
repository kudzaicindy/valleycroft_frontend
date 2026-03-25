import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAccountingBalanceSheet,
  getAccountingCashflow,
  getAccountingPl,
  getJournalEntries,
} from '@/api/accounting';
import { getTransactions } from '@/api/finance';
import { flattenJournalEntriesToLines, journalApiMeta } from '@/utils/journalEntriesNormalize';
import LedgerReportsBanner from '@/components/dashboard/LedgerReportsBanner';
import { MONTH_SHORT, defaultReportYear, endOfMonthDate, yearOptions, yearRange } from '@/utils/financePeriods';
import { cashflowSectionRows, cashflowStatementMetrics, groupBalanceSheetItems, normalizeBalanceSheetRows, plMetrics, rowAmount, rowLabel } from '@/utils/financeStatementHelpers';

const TABS = [
  { id: 'summary', label: 'Operating summary' },
  { id: 'balance-sheet', label: 'Balance sheet' },
  { id: 'cashflow', label: 'Cash flow' },
  { id: 'journals', label: 'Journal entries' },
];

function money(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num) || num === 0) return '-';
  return num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isNotFound(err) {
  return err?.response?.status === 404;
}

export default function LedgerPage() {
  const [tab, setTab] = useState('summary');
  const [year, setYear] = useState(defaultReportYear);
  const [basis, setBasis] = useState('accrual');
  const [bsYear, setBsYear] = useState(defaultReportYear);
  const [bsMonth, setBsMonth] = useState(() => new Date().getMonth());
  const [cfYear, setCfYear] = useState(defaultReportYear);
  const [entity, setEntity] = useState('all');
  const [journalPage, setJournalPage] = useState(1);
  const years = useMemo(() => yearOptions({ back: 8, forward: 1 }), []);

  const summaryRange = useMemo(() => yearRange(year), [year]);
  const cfRange = useMemo(() => yearRange(cfYear), [cfYear]);
  const bsAsAt = useMemo(() => endOfMonthDate(bsYear, bsMonth), [bsYear, bsMonth]);

  const summaryQuery = useQuery({
    queryKey: ['accounting', 'pl', summaryRange.start, summaryRange.end, basis, entity],
    queryFn: () =>
      getAccountingPl({
        start: summaryRange.start,
        end: summaryRange.end,
        basis,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    enabled: tab === 'summary',
    retry: false,
  });

  const bsQuery = useQuery({
    queryKey: ['accounting', 'balance-sheet', bsAsAt, entity],
    queryFn: () =>
      getAccountingBalanceSheet({
        end: bsAsAt,
        asAt: bsAsAt,
        date: bsAsAt,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    enabled: tab === 'balance-sheet',
    retry: false,
  });

  const cfQuery = useQuery({
    queryKey: ['accounting', 'cashflow', cfRange.start, cfRange.end, entity],
    queryFn: () =>
      getAccountingCashflow({
        start: cfRange.start,
        end: cfRange.end,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    enabled: tab === 'cashflow',
    retry: false,
  });

  const journalQuery = useQuery({
    queryKey: ['accounting', 'journal-entries', journalPage, entity],
    queryFn: () =>
      getJournalEntries({
        page: journalPage,
        limit: 25,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    enabled: tab === 'journals',
    retry: false,
  });
  const transactionsQuery = useQuery({
    queryKey: ['finance', 'transactions', 'ledger-fallback', journalPage, entity],
    queryFn: () =>
      getTransactions({
        page: journalPage,
        limit: 25,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    enabled: tab === 'journals',
    retry: false,
  });

  const summary = plMetrics(summaryQuery.data);
  const cf = cashflowStatementMetrics(cfQuery.data);
  const cfOperatingRows = cashflowSectionRows(cfQuery.data, 'operating');
  const cfInvestingRows = cashflowSectionRows(cfQuery.data, 'investing');
  const cfFinancingRows = cashflowSectionRows(cfQuery.data, 'financing');
  const bsItems = useMemo(() => normalizeBalanceSheetRows(bsQuery.data), [bsQuery.data]);
  const bsGroups = groupBalanceSheetItems(bsItems);
  const journals = flattenJournalEntriesToLines(journalQuery.data);
  const fallbackTransactions = useMemo(() => {
    const rows = Array.isArray(transactionsQuery.data)
      ? transactionsQuery.data
      : (transactionsQuery.data?.data ?? transactionsQuery.data?.transactions ?? []);
    return rows.filter((r) => r?.journalEntryId);
  }, [transactionsQuery.data]);
  const journalRows = journals.length > 0 ? journals : fallbackTransactions;
  const journalMeta = journalApiMeta(journalQuery.data);

  function ApiError({ query, label }) {
    if (!query.isError) return null;
    if (isNotFound(query.error)) {
      return (
        <div className="card card--compact finance-ledger-api-miss">
          <div className="card-body">
            <strong>{label}</strong> — endpoint not found (404). Ensure the API exposes{' '}
            <code>/api/accounting/…</code> per your server&apos;s <code>ACCOUNTING.md</code>.
          </div>
        </div>
      );
    }
    return (
      <div className="card card--error">
        <div className="card-body">{query.error?.message || 'Request failed'}</div>
      </div>
    );
  }

  return (
    <div className="finance-statement-page acct-ui-page">
      <LedgerReportsBanner />

      <div className="acct-ui-topbar">
        <div className="acct-ui-topbar-title-wrap">
          <div className="acct-ui-topbar-title">Ledger Reports</div>
          <div className="acct-ui-topbar-sub">Double-entry accounting statements and journal activity</div>
        </div>
        <div className="acct-ui-controls">
          {(tab === 'summary' || tab === 'cashflow') && (
            <label>Year
              <select className="form-control" value={tab === 'summary' ? year : cfYear} onChange={(e) => (tab === 'summary' ? setYear(Number(e.target.value)) : setCfYear(Number(e.target.value)))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          )}
          {tab === 'summary' && (
            <label>Basis
              <select className="form-control" value={basis} onChange={(e) => setBasis(e.target.value)}>
                <option value="accrual">Accrual</option>
                <option value="cash">Cash</option>
              </select>
            </label>
          )}
          {tab === 'balance-sheet' && (
            <>
              <label>Year
                <select className="form-control" value={bsYear} onChange={(e) => setBsYear(Number(e.target.value))}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label>Month
                <select className="form-control" value={bsMonth} onChange={(e) => setBsMonth(Number(e.target.value))}>
                  {MONTH_SHORT.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </label>
            </>
          )}
          <label>Entity
            <select className="form-control" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="all">All Entities</option>
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <i className="fas fa-download" /> Export
          </button>
        </div>
      </div>
      <div className="acct-ui-meta">Source: /api/accounting · View: {TABS.find((t) => t.id === tab)?.label}</div>

      <div className="finance-ledger-tabs" role="tablist" aria-label="Ledger views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={'finance-ledger-tab ' + (tab === t.id ? 'is-active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="card finance-stmt-card acct-ui-table-card">
          <div className="card-body card-body--no-pad">
            <ApiError query={summaryQuery} label="Ledger operating summary" />
            <table className="acct-ui-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="acct-ui-section acct-ui-section--pos"><td colSpan={2}>Income statement (ledger)</td></tr>
                <tr>
                  <td>Total income</td>
                  <td className="num">{summaryQuery.isLoading ? '…' : money(summary.income)}</td>
                </tr>
                <tr>
                  <td>Total expenses</td>
                  <td className="num">{summaryQuery.isLoading ? '…' : money(summary.expense)}</td>
                </tr>
                <tr className="acct-ui-total-row">
                  <td><strong>Net result</strong></td>
                  <td className={`num ${summary.profit >= 0 ? 'pos' : 'neg'}`}><strong>{summaryQuery.isLoading ? '…' : money(summary.profit)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'balance-sheet' && (
        <div className="card finance-stmt-card acct-ui-table-card">
          <div className="card-body card-body--no-pad">
            <ApiError query={bsQuery} label="Ledger balance sheet" />
            <table className="acct-ui-table acct-ui-table--balance">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th className="num">{MONTH_SHORT[bsMonth].toUpperCase()} {String(bsYear).slice(-2)}</th>
                </tr>
              </thead>
              <tbody>
                {bsQuery.isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
                {!bsQuery.isLoading && bsItems.length === 0 && !bsQuery.isError && <tr><td colSpan={5}>No balance sheet lines returned.</td></tr>}
                {!bsQuery.isLoading && bsGroups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={5}>{group.label}</td></tr>
                    {group.rows.map((row, i) => (
                      <tr key={`${group.key}-${i}`}>
                        <td>{row.code || row.accountCode || '—'}</td>
                        <td>{rowLabel(row)}</td>
                        <td>{row.category || row.group || '—'}</td>
                        <td>{row.type || row.section || '—'}</td>
                        <td className="num">{money(row.amount ?? row.value ?? null)}</td>
                      </tr>
                    ))}
                    <tr className="acct-ui-total-row">
                      <td colSpan={4}><strong>Subtotal</strong></td>
                      <td className="num"><strong>{money(group.rows.reduce((s, r) => s + (Number(rowAmount(r)) || 0), 0))}</strong></td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'cashflow' && (
        <div className="card finance-stmt-card acct-ui-table-card">
          <div className="card-body card-body--no-pad">
            <ApiError query={cfQuery} label="Ledger cash flow" />
            <table className="acct-ui-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={2}>Operating activities</td></tr>
                {cfOperatingRows.map((r) => (
                  <tr key={`op-${r.key}`}>
                    <td>{r.label}</td>
                    <td className={`num ${r.amount >= 0 ? 'pos' : 'neg'}`}>{cfQuery.isLoading ? '…' : money(r.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total operating activities</strong></td>
                  <td className={`num ${cf.operating >= 0 ? 'pos' : 'neg'}`}>{cfQuery.isLoading ? '…' : money(cf.operating)}</td>
                </tr>
                <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={2}>Investing activities</td></tr>
                {cfInvestingRows.map((r) => (
                  <tr key={`inv-${r.key}`}>
                    <td>{r.label}</td>
                    <td className={`num ${r.amount >= 0 ? 'pos' : 'neg'}`}>{cfQuery.isLoading ? '…' : money(r.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total investing activities</strong></td>
                  <td className={`num ${cf.investing >= 0 ? 'pos' : 'neg'}`}>{cfQuery.isLoading ? '…' : money(cf.investing)}</td>
                </tr>
                <tr className="acct-ui-section acct-ui-section--neutral"><td colSpan={2}>Financing activities</td></tr>
                {cfFinancingRows.map((r) => (
                  <tr key={`fin-${r.key}`}>
                    <td>{r.label}</td>
                    <td className={`num ${r.amount >= 0 ? 'pos' : 'neg'}`}>{cfQuery.isLoading ? '…' : money(r.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total financing activities</strong></td>
                  <td className={`num ${cf.financing >= 0 ? 'pos' : 'neg'}`}>{cfQuery.isLoading ? '…' : money(cf.financing)}</td>
                </tr>
                <tr className="acct-ui-total-row">
                  <td><strong>Net change in cash</strong></td>
                  <td className={`num ${cf.netChange >= 0 ? 'pos' : 'neg'}`}><strong>{cfQuery.isLoading ? '…' : money(cf.netChange)}</strong></td>
                </tr>
                <tr>
                  <td>Opening cash</td>
                  <td className="num">{cfQuery.isLoading ? '…' : money(cf.openingCash)}</td>
                </tr>
                <tr className="acct-ui-total-row">
                  <td><strong>Closing cash</strong></td>
                  <td className="num"><strong>{cfQuery.isLoading ? '…' : money(cf.closingCash)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'journals' && (
        <div className="card finance-stmt-card acct-ui-table-card">
          <div className="card-body card-body--no-pad">
            <ApiError query={journalQuery} label="Journal entries" />
            <table className="acct-ui-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {journalQuery.isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
                {!journalQuery.isLoading &&
                  !transactionsQuery.isLoading &&
                  journalRows.length === 0 &&
                  !journalQuery.isError && (
                    <tr><td colSpan={5}>No journal lines returned.</td></tr>
                  )}
                {!journalQuery.isLoading &&
                  journalRows.map((j, i) => (
                    <tr key={j._id ?? j.id ?? i}>
                      <td>{j.date ?? j.entryDate ?? j.postedAt?.slice?.(0, 10) ?? '—'}</td>
                      <td>{j.reference ?? j.ref ?? j.entryNumber ?? j.journalEntryId ?? '—'}</td>
                      <td>{j.description ?? j.memo ?? j.narration ?? j._entryDescription ?? '—'}</td>
                      <td className="num">{j.debit != null || j.debitAmount != null || j.totalDebit != null ? money(j.debit ?? j.debitAmount ?? j.totalDebit) : ''}</td>
                      <td className="num">{j.credit != null || j.creditAmount != null || j.totalCredit != null ? money(j.credit ?? j.creditAmount ?? j.totalCredit) : ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(journalMeta.total > 25 || journalMeta.pages > 1) && (
              <div className="pagination-bar">
                <span className="pagination-info">Page {journalMeta.page ?? journalPage}</span>
                <div className="pagination-btns">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={journalPage <= 1}
                    onClick={() => setJournalPage((p) => p - 1)}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={journalRows.length < 25}
                    onClick={() => setJournalPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
