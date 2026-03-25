import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/api/finance';
import { TRANSACTION_CATEGORY_OPTIONS, transactionCategoryLabel } from '@/constants/transactionCategories';
import { ACCOUNT_OPTIONS } from '@/constants/financeAccounts';
import { buildTransactionWritePayload } from '@/utils/transactionWritePayload';
import { formatTransactionMutationMessage } from '@/utils/apiError';
import { parseLocalDate } from '@/utils/availability';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import { newIdempotencyKey, isTransactionLedgerPosted, getTransactionRowDebitCreditNet } from '@/utils/transactionLedgerUi';
import { normalizeTransactionsFetchResult } from '@/utils/transactionsResponse';

const LIMIT = 20;

function moneyOrBlank(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

/** Table display: day + full month + year (API may send YYYY-MM-DD or ISO). */
function formatTransactionTableDate(val) {
  if (val == null || val === '') return '—';
  const parsed = parseLocalDate(val);
  if (parsed) return formatDateDayMonthYear(parsed);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : formatDateDayMonthYear(d);
}

const emptyForm = () => ({
  type: 'income',
  category: '',
  description: '',
  amount: '',
  debitAccount: '1000',
  creditAccount: '4000',
  date: '',
  reference: '',
  booking: '',
});

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const qpStart = searchParams.get('start') || '';
  const qpEnd = searchParams.get('end') || '';
  const qpCategory = searchParams.get('category') || '';
  const qpType = searchParams.get('type') || '';
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', page, qpStart, qpEnd, qpCategory],
    queryFn: async () => {
      const res = await getTransactions({
        page,
        limit: LIMIT,
        ...(qpStart ? { start: qpStart } : {}),
        ...(qpEnd ? { end: qpEnd } : {}),
        ...(qpCategory ? { category: qpCategory } : {}),
      });
      return normalizeTransactionsFetchResult(res);
    },
  });
  const listRaw = data?.list ?? [];
  const list = useMemo(() => {
    if (!qpType) return listRaw;
    return listRaw.filter((t) => (t.type || '') === qpType);
  }, [listRaw, qpType]);
  const meta = data?.meta ?? {};

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row) => {
    const isRefundRow = row.category === 'refund';
    setEditingId(row._id ?? row.id);
    setForm({
      type: isRefundRow ? 'refund' : row.type === 'expense' ? 'expense' : 'income',
      category: row.category || '',
      description: row.description || '',
      amount: row.amount != null ? String(row.amount) : '',
      debitAccount: String(
        row.debitAccount ||
          row.debitAccountCode ||
          (isRefundRow ? '4000' : row.type === 'expense' ? '6000' : '1000') ||
          ''
      ),
      creditAccount: String(
        row.creditAccount ||
          row.creditAccountCode ||
          (isRefundRow ? '1000' : row.type === 'expense' ? '1000' : '4000') ||
          ''
      ),
      date: row.date ? String(row.date).slice(0, 10) : '',
      reference: row.reference || '',
      booking: row.booking != null ? String(row.booking) : '',
    });
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setSaveError(null);
  }, []);

  const invalidateList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: ({ body, idempotencyKey }) => createTransaction(body, { idempotencyKey }),
    onSuccess: () => {
      invalidateList();
      closeModal();
    },
    onError: (err) => {
      setSaveError(formatTransactionMutationMessage(err).join('\n'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateTransaction(id, body),
    onSuccess: () => {
      invalidateList();
      closeModal();
    },
    onError: (err) => {
      setSaveError(formatTransactionMutationMessage(err).join('\n'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteTransaction(id),
    onSuccess: () => invalidateList(),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setSaveError(null);
    try {
      const body = buildTransactionWritePayload(form);
      if (editingId) {
        updateMutation.mutate({ id: editingId, body });
      } else {
        createMutation.mutate({ body, idempotencyKey: newIdempotencyKey() });
      }
    } catch (ve) {
      if (ve?.code === 'VALIDATION') setSaveError(ve.message);
      else setSaveError(ve?.message || 'Invalid form.');
    }
  }

  function handleDelete(row) {
    const id = row._id ?? row.id;
    if (!id) return;
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    deleteMutation.mutate(id);
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const colCount = 10;
  const totals = meta?.totals ?? {};

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Transactions</div>
          <div className="page-subtitle">Income and expense entries (posted to the ledger when accounting is configured)</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <i className="fas fa-plus" /> Add
        </button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      {modalOpen && (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transactions-modal-title"
          onClick={closeModal}
        >
          <div className="transactions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="transactions-modal-title">{editingId ? 'Edit transaction' : 'Add transaction'}</h3>
              <button type="button" className="transactions-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form onSubmit={handleSubmit}>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field">
                    <label htmlFor="tx-type">Type</label>
                    <select
                      id="tx-type"
                      className="form-control"
                      value={form.type}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setForm((f) => ({
                          ...f,
                          type: nextType,
                          category:
                            nextType === 'refund'
                              ? 'refund'
                              : f.category === 'refund'
                                ? ''
                                : f.category,
                          debitAccount:
                            nextType === 'refund' ? '4000' : nextType === 'expense' ? '6000' : '1000',
                          creditAccount:
                            nextType === 'refund' ? '1000' : nextType === 'expense' ? '1000' : '4000',
                        }));
                      }}
                    >
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="refund">Refund</option>
                    </select>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="tx-category">Category</label>
                    <select
                      id="tx-category"
                      className="form-control"
                      required={form.type !== 'refund'}
                      disabled={form.type === 'refund'}
                      value={form.type === 'refund' ? 'refund' : form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      {TRANSACTION_CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="tx-desc">Description</label>
                    <input
                      id="tx-desc"
                      className="form-control"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="tx-amount">Amount (ZAR)</label>
                    <input
                      id="tx-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="tx-debit-account">Account to debit</label>
                    <select
                      id="tx-debit-account"
                      className="form-control"
                      required
                      value={form.debitAccount}
                      onChange={(e) => setForm((f) => ({ ...f, debitAccount: e.target.value }))}
                    >
                      <option value="">Select account…</option>
                      {ACCOUNT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="tx-credit-account">Account to credit</label>
                    <select
                      id="tx-credit-account"
                      className="form-control"
                      required
                      value={form.creditAccount}
                      onChange={(e) => setForm((f) => ({ ...f, creditAccount: e.target.value }))}
                    >
                      <option value="">Select account…</option>
                      {ACCOUNT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field">
                    <label>Debit / Credit preview</label>
                    <div className="form-control" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Dr{' '}
                        {form.type === 'expense' || form.type === 'refund' ? moneyOrBlank(form.amount) : ''}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Cr{' '}
                        {form.type === 'income' || form.type === 'refund' ? moneyOrBlank(form.amount) : ''}
                      </span>
                    </div>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="tx-date">Date</label>
                    <input
                      id="tx-date"
                      type="date"
                      className="form-control"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="tx-ref">Reference</label>
                    <input
                      id="tx-ref"
                      className="form-control"
                      value={form.reference}
                      onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                      placeholder="Invoice #, ref…"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="tx-booking">Booking ID</label>
                    <input
                      id="tx-booking"
                      className="form-control"
                      value={form.booking}
                      onChange={(e) => setForm((f) => ({ ...f, booking: e.target.value }))}
                      placeholder="Optional linked booking"
                    />
                  </div>
                </div>
                <p style={{ marginTop: 10, marginBottom: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                  {form.type === 'refund'
                    ? 'Refunds post like other transactions (e.g. debit revenue, credit cash) and appear on the Transactions page.'
                    : 'Every transaction must include both sides: one debit account and one credit account.'}
                </p>
                {saveError && (
                  <div className="card card--error" style={{ marginTop: 12 }}>
                    <div className="card-body" style={{ whiteSpace: 'pre-line', fontSize: 13 }}>
                      {saveError}
                    </div>
                  </div>
                )}
                <div className="transactions-modal-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={closeModal} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Ledger</th>
                  <th className="statement-table-num">Debit</th>
                  <th className="statement-table-num">Credit</th>
                  <th className="statement-table-num">Net</th>
                  <th className="statement-table-num">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={colCount}>Loading…</td>
                  </tr>
                )}
                {!isLoading && list.length === 0 && (
                  <tr>
                    <td colSpan={colCount}>No transactions</td>
                  </tr>
                )}
                {!isLoading &&
                  list.map((t) => {
                    const id = t._id ?? t.id;
                    const jid = t.journalEntryId;
                    const posted = isTransactionLedgerPosted(t);
                    const refundLike = t.category === 'refund';
                    const { rowDebit, rowCredit, rowNet } = getTransactionRowDebitCreditNet(t);
                    const runningNet = t.netBalance ?? ((Number(t.creditBalance) || 0) - (Number(t.debitBalance) || 0));
                    return (
                      <tr key={id || JSON.stringify(t)}>
                        <td>{formatTransactionTableDate(t.date)}</td>
                        <td>
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
                        <td>{transactionCategoryLabel(t.category)}</td>
                        <td>{t.description || '—'}</td>
                        <td>
                          {posted ? (
                            <span
                              className="transactions-ledger-pill"
                              title={jid ? String(jid) : t.ledgerStatus || 'Posted'}
                            >
                              <i className="fas fa-book" aria-hidden />
                              Posted
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted, #6b7a72)' }} title="Unposted">
                              —
                            </span>
                          )}
                        </td>
                        <td className="statement-table-num pl-neg">{moneyOrBlank(rowDebit)}</td>
                        <td className="statement-table-num pl-pos">{moneyOrBlank(rowCredit)}</td>
                        <td className={'statement-table-num ' + ((Number(rowNet) || 0) >= 0 ? 'pl-pos' : 'pl-neg')}>
                          {moneyOrBlank(rowNet)}
                        </td>
                        <td className={'statement-table-num ' + ((Number(runningNet) || 0) >= 0 ? 'pl-pos' : 'pl-neg')}>
                          {moneyOrBlank(runningNet)}
                        </td>
                        <td>
                          <div className="transactions-table-actions">
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(t)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => handleDelete(t)}
                              disabled={deleteMutation.isPending}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}><strong>Totals</strong></td>
                  <td className="statement-table-num pl-neg"><strong>{moneyOrBlank(totals.debit)}</strong></td>
                  <td className="statement-table-num pl-pos"><strong>{moneyOrBlank(totals.credit)}</strong></td>
                  <td className={'statement-table-num ' + ((Number(totals.net ?? 0)) >= 0 ? 'pl-pos' : 'pl-neg')}>
                    <strong>{moneyOrBlank(totals.net)}</strong>
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {Number(meta.duplicateRowsCollapsed) > 0 && (
            <p
              style={{
                margin: 0,
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--text-muted)',
                borderTop: '1px solid var(--linen-dark, #e8e4dc)',
              }}
            >
              {meta.duplicateRowsCollapsed} duplicate row
              {Number(meta.duplicateRowsCollapsed) === 1 ? '' : 's'} merged on this page (server collapse).
              Use <code style={{ fontSize: 11 }}>?collapseDuplicates=0</code> on the API to list every document.
            </p>
          )}
          {(meta.total || 0) > LIMIT && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Page {meta.page ?? page} of {Math.ceil((meta.total || 0) / LIMIT) || 1}
              </span>
              <div className="pagination-btns">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={page >= Math.ceil((meta.total || 0) / LIMIT)}
                  onClick={() => setPage((p) => p + 1)}
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
