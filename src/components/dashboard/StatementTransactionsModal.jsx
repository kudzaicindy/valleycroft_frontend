import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getTransactions } from '@/api/finance';
import { transactionCategoryLabel } from '@/constants/transactionCategories';
import { ACCOUNT_OPTIONS } from '@/constants/financeAccounts';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import { parseLocalDate } from '@/utils/availability';
import {
  filterTransactionsForDrilldown,
  sumTransactionAbsAmounts,
  sumTransactionNetEffect,
} from '@/utils/statementDrilldown';
import { normalizeTransactionsFetchResult } from '@/utils/transactionsResponse';
import {
  getTransactionRowDebitCreditNet,
  getTransactionDebitCreditAccounts,
  isTransactionLedgerPosted,
} from '@/utils/transactionLedgerUi';

function moneyCell(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyOrBlank(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

function accountLabel(code) {
  const c = String(code ?? '').trim();
  if (!c) return '—';
  const o = ACCOUNT_OPTIONS.find((x) => x.value === c);
  return o ? o.label : c;
}

/** Primary line for drill-down: API name, else chart label, else code. */
function debitCreditAccountTitle(apiName, code) {
  const name = String(apiName ?? '').trim();
  if (name) return name;
  const c = String(code ?? '').trim();
  if (!c) return '—';
  const lbl = accountLabel(c);
  return lbl !== '—' ? lbl : c;
}

function formatTxDate(val) {
  if (val == null || val === '') return '—';
  const parsed = parseLocalDate(val);
  if (parsed) return formatDateDayMonthYear(parsed);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : formatDateDayMonthYear(d);
}

function sortKeyForLedger(t) {
  const d = String(t?.date ?? '').slice(0, 10);
  const id = String(t?._id ?? t?.id ?? '');
  return `${d}\t${id}`;
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {string} props.start - YYYY-MM-DD
 * @param {string} props.end - YYYY-MM-DD
 * @param {string | null} [props.category] - transaction category filter (API + client)
 * @param {string | null} [props.type] - income | expense — client filter after fetch
 * @param {number | null} [props.statementAmount] - expected total from statement line for comparison
 * @param {'abs' | 'signed'} [props.sumMode] - how to sum listed rows vs statement (default abs)
 */
export default function StatementTransactionsModal({
  open,
  onClose,
  title,
  subtitle,
  start,
  end,
  category,
  type,
  statementAmount,
  sumMode = 'abs',
}) {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['finance', 'statement-drilldown', start, end, category ?? ''],
    queryFn: async () => {
      const res = await getTransactions({
        start,
        end,
        limit: 500,
        ...(category ? { category } : {}),
      });
      return normalizeTransactionsFetchResult(res).list;
    },
    enabled: open && Boolean(start && end),
    staleTime: 30 * 1000,
  });

  const filtered = useMemo(
    () => filterTransactionsForDrilldown(data || [], { type: type || null, category: category || null }),
    [data, type, category]
  );

  const ledgerRows = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => sortKeyForLedger(a).localeCompare(sortKeyForLedger(b)));
    let running = 0;
    return sorted.map((t) => {
      const { rowDebit, rowCredit, rowNet } = getTransactionRowDebitCreditNet(t);
      running += Number(rowNet) || 0;
      const { debitCode, creditCode, debitName, creditName } = getTransactionDebitCreditAccounts(t);
      return {
        t,
        rowDebit,
        rowCredit,
        rowNet,
        debitCode,
        creditCode,
        debitName,
        creditName,
        runningBalance: running,
      };
    });
  }, [filtered]);

  const txSum = useMemo(
    () => (sumMode === 'signed' ? sumTransactionNetEffect(filtered) : sumTransactionAbsAmounts(filtered)),
    [filtered, sumMode]
  );

  if (!open) return null;

  const search = new URLSearchParams();
  if (start) search.set('start', start);
  if (end) search.set('end', end);
  if (category) search.set('category', category);
  if (type) search.set('type', type);
  const txLink = `/finance/transactions?${search.toString()}`;

  return (
    <div className="transactions-modal-overlay statement-drill-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="transactions-modal statement-drill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="transactions-modal-header">
          <div>
            <h3 id="statement-drill-title">{title}</h3>
            {subtitle ? <p className="statement-drill-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="transactions-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="transactions-modal-body statement-drill-body">
          <p className="statement-drill-meta">
            <span>{start}</span>
            {' → '}
            <span>{end}</span>
            {category ? (
              <>
                {' · '}
                <span>Category: {transactionCategoryLabel(category)}</span>
              </>
            ) : null}
            {type ? (
              <>
                {' · '}
                <span>Type: {type}</span>
              </>
            ) : null}
          </p>
          {error && (
            <div className="card card--error" style={{ marginBottom: 12 }}>
              <div className="card-body" style={{ fontSize: 13 }}>
                {error.message || 'Could not load transactions.'}
              </div>
            </div>
          )}
          {(isLoading || isFetching) && !data?.length && (
            <p className="statement-drill-loading">Loading transactions…</p>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <p className="statement-drill-empty">No matching transactions in this period.</p>
          )}
          {ledgerRows.length > 0 && (
            <>
              <div className="statement-table-wrap statement-drill-table-wrap">
                <table className="statement-table statement-drill-ledger-table acct-ui-table statement-drill-table">
                  <thead>
                    <tr>
                      <th className="statement-drill-col-date">Date</th>
                      <th className="statement-drill-col-type">Type</th>
                      <th className="statement-drill-col-cat">Category</th>
                      <th className="statement-drill-col-desc">Description</th>
                      <th className="statement-drill-col-ledger">Ledger</th>
                      <th className="statement-drill-col-acct-debit">Account debited</th>
                      <th className="statement-table-num statement-drill-col-amt">Debit</th>
                      <th className="statement-drill-col-acct-cr">Account credited</th>
                      <th className="statement-table-num statement-drill-col-amt">Credit</th>
                      <th className="statement-table-num statement-drill-col-net">Net</th>
                      <th className="statement-table-num statement-drill-col-run">Running balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map(
                      ({
                        t,
                        rowDebit,
                        rowCredit,
                        rowNet,
                        debitCode,
                        creditCode,
                        debitName,
                        creditName,
                        runningBalance,
                      }) => {
                        const id = t._id ?? t.id;
                        const jid = t.journalEntryId;
                        const posted = isTransactionLedgerPosted(t);
                        const refundLike = t.category === 'refund';
                        const debitTitle = debitCreditAccountTitle(debitName, debitCode);
                        const creditTitle = debitCreditAccountTitle(creditName, creditCode);
                        return (
                          <tr key={id || JSON.stringify(t)}>
                            <td className="statement-drill-col-date">{formatTxDate(t.date)}</td>
                            <td className="statement-drill-col-type">
                              <span
                                className={
                                  'badge ' +
                                  (refundLike
                                    ? 'badge-pending'
                                    : t.type === 'income'
                                      ? 'badge-confirmed'
                                      : 'badge-cancelled')
                                }
                              >
                                {refundLike ? 'refund' : t.type || '—'}
                              </span>
                            </td>
                            <td className="statement-drill-col-cat">{transactionCategoryLabel(t.category)}</td>
                            <td className="statement-drill-col-desc" title={t.description || ''}>
                              {t.description || '—'}
                              {jid ? (
                                <div className="statement-drill-journal-ref-inline">
                                  <span className="statement-drill-entry-ref-label">Journal</span>
                                  <code>{String(jid)}</code>
                                </div>
                              ) : null}
                            </td>
                            <td className="statement-drill-col-ledger">
                              {posted ? (
                                <span className="transactions-ledger-pill" title={jid ? String(jid) : t.ledgerStatus || 'Posted'}>
                                  <i className="fas fa-book" aria-hidden />
                                  Posted
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-muted, #6b7a72)' }} title="Unposted">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="statement-drill-acct-cell" title={debitTitle !== '—' ? debitTitle : undefined}>
                              <div className="statement-drill-acct-name">{debitTitle}</div>
                              {debitCode ? (
                                <div className="statement-drill-acct-code">Code {debitCode}</div>
                              ) : null}
                            </td>
                            <td className={'statement-table-num statement-drill-col-amt pl-neg'}>{moneyOrBlank(rowDebit)}</td>
                            <td className="statement-drill-acct-cell" title={creditTitle !== '—' ? creditTitle : undefined}>
                              <div className="statement-drill-acct-name">{creditTitle}</div>
                              {creditCode ? (
                                <div className="statement-drill-acct-code">Code {creditCode}</div>
                              ) : null}
                            </td>
                            <td className={'statement-table-num statement-drill-col-amt pl-pos'}>{moneyOrBlank(rowCredit)}</td>
                            <td
                              className={
                                'statement-table-num statement-drill-col-net ' +
                                ((Number(rowNet) || 0) >= 0 ? 'pl-pos' : 'pl-neg')
                              }
                            >
                              {moneyOrBlank(rowNet)}
                            </td>
                            <td
                              className={
                                'statement-table-num statement-drill-col-run ' +
                                ((Number(runningBalance) || 0) >= 0 ? 'pl-pos' : 'pl-neg')
                              }
                            >
                              {moneyOrBlank(runningBalance)}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="statement-drill-ledger-foot">
                      <td colSpan={9}>
                        <strong>Totals</strong>
                        <span className="statement-drill-foot-hint"> — net is credit minus debit per row</span>
                      </td>
                      <td className="statement-table-num statement-drill-col-net">
                        <strong>
                          {moneyOrBlank(
                            ledgerRows.reduce((s, r) => s + (Number(r.rowNet) || 0), 0)
                          )}
                        </strong>
                      </td>
                      <td className="statement-table-num statement-drill-col-run" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="statement-drill-ledger-note">
                Running balance is cumulative net for these transactions in date order (credit − debit).
              </p>
            </>
          )}
          <div className="statement-drill-footer">
            {statementAmount != null && Number.isFinite(Number(statementAmount)) && filtered.length > 0 && (
              <p className="statement-drill-compare">
                <span>Statement line: </span>
                <strong>{moneyCell(statementAmount)}</strong>
                <span> · Sum of listed transactions: </span>
                <strong>{moneyCell(txSum)}</strong>
                {Math.abs(Number(statementAmount) - txSum) > 0.02 && (
                  <span className="statement-drill-compare-warn"> (difference may be rounding or non-transaction journals)</span>
                )}
              </p>
            )}
            <div className="statement-drill-actions">
              <Link to={txLink} className="btn btn-outline btn-sm" onClick={onClose}>
                Open in Transactions
              </Link>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
