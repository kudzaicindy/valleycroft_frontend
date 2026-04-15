import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJournalEntries } from '@/api/accounting';
import { getTransactions } from '@/api/finance';
import { flattenJournalEntriesToLines, journalApiMeta } from '@/utils/journalEntriesNormalize';

function money(n) {
  const num = Number(n);
  if (n == null || Number.isNaN(num) || num === 0) return '-';
  return num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isNotFound(err) {
  return err?.response?.status === 404;
}

export default function LedgerPage() {
  const [entity, setEntity] = useState('all');
  const [journalPage, setJournalPage] = useState(1);

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
        limit: 25,
        ...(entity !== 'all' ? { entity } : {}),
      }),
    retry: false,
  });

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
      <div className="acct-ui-meta">Source: /api/accounting/journal-entries (with finance transaction fallback when empty)</div>

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
                !journalQuery.isError && <tr><td colSpan={5}>No journal lines returned.</td></tr>}
              {!journalQuery.isLoading &&
                journalRows.map((j, i) => (
                  <tr key={j._id ?? j.id ?? i}>
                    <td>{j.date ?? j.entryDate ?? j.postedAt?.slice?.(0, 10) ?? '—'}</td>
                    <td>{j.reference ?? j.ref ?? j.entryNumber ?? j.journalEntryId ?? '—'}</td>
                    <td>{j.description ?? j.memo ?? j.narration ?? j._entryDescription ?? '—'}</td>
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
