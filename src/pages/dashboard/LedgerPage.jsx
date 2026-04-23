import { useMemo, useState } from 'react';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { useQuery } from '@tanstack/react-query';
import { getJournalEntries } from '@/api/accounting';
import { getTransactions, FINANCE_TRANSACTIONS_MAX_LIMIT } from '@/api/finance';
import { flattenJournalEntriesToLines, journalApiMeta } from '@/utils/journalEntriesNormalize';
import { normalizeTransactionsFetchResult } from '@/utils/transactionsResponse';
import { parseLocalDate } from '@/utils/availability';
import { formatDateNumericDayMonthYear } from '@/utils/formatDate';

function isPostedLedgerLikeRow(r) {
  if (!r || typeof r !== 'object') return false;
  return (
    r.status === 'posted' ||
    r.ledgerStatus === 'posted' ||
    Boolean(r.journalEntryId || r.journalId || r.transactionId) ||
    (Array.isArray(r.entries) && r.entries.length > 0) ||
    r.totalDebit != null ||
    r.totalCredit != null
  );
}

function money(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num) || num === 0) return '-';
  return num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isNotFound(err) {
  return err?.response?.status === 404;
}

/** Calendar day from API (YYYY-MM-DD or ISO); display as DD/MM/YYYY. */
function formatLedgerTableDate(val) {
  if (val == null || val === '') return '—';
  const parsed = parseLocalDate(val);
  if (parsed) return formatDateNumericDayMonthYear(parsed);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : formatDateNumericDayMonthYear(d);
}

/** Line `description` is often ""; use non-empty line text, else parent transaction description. */
function ledgerLineDescription(row) {
  const fromLine = [row.description, row.memo, row.narration].find((s) => s != null && String(s).trim() !== '');
  if (fromLine != null) return String(fromLine).trim();
  if (row._entryDescription != null && String(row._entryDescription).trim() !== '') {
    return String(row._entryDescription).trim();
  }
  return '—';
}

export default function LedgerPage() {
  const [entity, setEntity] = useState('all');
  const [journalPage, setJournalPage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const journalQuery = useQuery({
    queryKey: ['accounting', 'journal-entries', journalPage, entity],
    queryFn: () =>
      getJournalEntries({
        page: journalPage,
        limit: 25,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    retry: false,
  });

  const transactionsQuery = useQuery({
    queryKey: ['finance', 'transactions', 'ledger-fallback', journalPage, entity],
    queryFn: () =>
      getTransactions({
        page: journalPage,
        limit: FINANCE_TRANSACTIONS_MAX_LIMIT,
        includeByAccount: 0,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    retry: false,
  });

  const journals = flattenJournalEntriesToLines(journalQuery.data);
  /** Finance API returns journal-shaped docs with `entries` (not `lines`); flatten now maps both. */
  const financeLedgerLines = useMemo(() => {
    const normalized = normalizeTransactionsFetchResult(transactionsQuery.data).list;
    const raw = transactionsQuery.data;
    const direct = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.transactions)
          ? raw.transactions
          : Array.isArray(raw?.data?.data)
            ? raw.data.data
            : [];
    const merged = [...normalized, ...direct];
    const uniq = [];
    const seen = new Set();
    for (const r of merged) {
      if (!r || typeof r !== 'object') continue;
      const k = String(r._id ?? r.id ?? r.transactionId ?? r.journalEntryId ?? JSON.stringify(r));
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(r);
    }
    const posted = uniq.filter(isPostedLedgerLikeRow);
    return flattenJournalEntriesToLines(posted);
  }, [transactionsQuery.data]);
  const journalRows = journals.length > 0 ? journals : financeLedgerLines;
  const journalMeta = journalApiMeta(journalQuery.data);

  const displayedJournalRows = useMemo(() => {
    let rows = journalRows;
    if (monthFilter) {
      rows = rows.filter((j) => {
        const d = String(j.date ?? j.entryDate ?? j.postedAt ?? '').slice(0, 7);
        if (!d) return true;
        return d === monthFilter;
      });
    }
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter((j) => {
      const acct =
        j.accountCode && (j.accountName ?? j.account?.name)
          ? `${j.accountCode} ${j.accountName ?? j.account?.name}`
          : String(j.accountName ?? j.account?.name ?? j.accountCode ?? '');
      return (
        String(j.reference ?? j.ref ?? '').toLowerCase().includes(q) ||
        String(ledgerLineDescription(j)).toLowerCase().includes(q) ||
        acct.toLowerCase().includes(q)
      );
    });
  }, [journalRows, monthFilter, tableSearch]);

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
      <div className="acct-ui-topbar">
        <div className="acct-ui-topbar-title-wrap">
          <div className="acct-ui-topbar-title">Ledger</div>
          <div className="acct-ui-topbar-sub">Journal entries from posted transactions — use Cash flow, Income statement, and Balance sheet in the sidebar for those views.</div>
        </div>
        <div className="acct-ui-controls">
          <label>
            Entity
            <select className="form-control" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="all">All Entities</option>
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <i className="fas fa-download" /> Export
          </button>
        </div>
      </div>
      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search reference, account, description…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />
      <div className="card finance-stmt-card acct-ui-table-card">
        <div className="card-body card-body--no-pad">
          <ApiError query={journalQuery} label="Journal entries" />
          {journals.length === 0 && <ApiError query={transactionsQuery} label="Finance transactions fallback" />}
          <table className="acct-ui-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Account</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {journalQuery.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
              {!journalQuery.isLoading &&
                !transactionsQuery.isLoading &&
                journalRows.length === 0 &&
                !journalQuery.isError && <tr><td colSpan={6}>No journal lines returned.</td></tr>}
              {!journalQuery.isLoading &&
                !transactionsQuery.isLoading &&
                journalRows.length > 0 &&
                displayedJournalRows.length === 0 && (
                  <tr>
                    <td colSpan={6}>No lines match the current search or month filter.</td>
                  </tr>
                )}
              {!journalQuery.isLoading &&
                displayedJournalRows.map((j, i) => (
                  <tr key={j._id ?? j.id ?? i}>
                    <td>{formatLedgerTableDate(j.date ?? j.entryDate ?? j.postedAt)}</td>
                    <td>{j.reference ?? j.ref ?? j.entryNumber ?? j.journalEntryId ?? '—'}</td>
                    <td>
                      {j.accountCode && (j.accountName ?? j.account?.name)
                        ? `${j.accountCode} — ${j.accountName ?? j.account?.name}`
                        : j.accountName ?? j.account?.name ?? j.accountCode ?? j.account?.code ?? '—'}
                    </td>
                    <td>{ledgerLineDescription(j)}</td>
                    <td className="num">
                      {j.debit != null || j.debitAmount != null || j.totalDebit != null
                        ? money(j.debit ?? j.debitAmount ?? j.totalDebit)
                        : ''}
                    </td>
                    <td className="num">
                      {j.credit != null || j.creditAmount != null || j.totalCredit != null
                        ? money(j.credit ?? j.creditAmount ?? j.totalCredit)
                        : ''}
                    </td>
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
    </div>
  );
}
