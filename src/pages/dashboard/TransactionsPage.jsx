import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  FINANCE_TRANSACTIONS_MAX_LIMIT,
} from '@/api/finance';
import { TRANSACTION_CATEGORY_OPTIONS, transactionCategoryLabel } from '@/constants/transactionCategories';
import { useAccountsSelectOptions } from '@/hooks/useAccountsSelectOptions';
import { buildTransactionWritePayload } from '@/utils/transactionWritePayload';
import { formatTransactionMutationMessage } from '@/utils/apiError';
import { parseLocalDate } from '@/utils/availability';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { newIdempotencyKey, getTransactionRowDebitCreditNet } from '@/utils/transactionLedgerUi';
import { normalizeTransactionsFetchResult } from '@/utils/transactionsResponse';
import ConfirmModal from '@/components/ConfirmModal';

const LIMIT = 20;
/** When URL has a date range, request up to the finance route max so the table matches statement drill-down. */
const LIST_LIMIT_WITH_RANGE = FINANCE_TRANSACTIONS_MAX_LIMIT;

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

export default function TransactionsPage({ forcedType = '' }) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const qpStart = searchParams.get('start') || '';
  const qpEnd = searchParams.get('end') || '';
  const qpCategory = searchParams.get('category') || '';
  const qpType = searchParams.get('type') || '';
  const [page, setPage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { options: accountSelectOptions } = useAccountsSelectOptions();

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', page, qpStart, qpEnd, qpCategory],
    queryFn: async () => {
      const hasDateRange = Boolean(qpStart && qpEnd);
      const res = await getTransactions({
        page,
        limit: hasDateRange ? LIST_LIMIT_WITH_RANGE : LIMIT,
        includeByAccount: 0,
        ...(qpStart ? { start: qpStart } : {}),
        ...(qpEnd ? { end: qpEnd } : {}),
        ...(qpCategory ? { category: qpCategory } : {}),
      });
      return normalizeTransactionsFetchResult(res);
    },
  });
  const listRaw = data?.list ?? [];
  const effectiveType = qpType || forcedType;
  const list = useMemo(() => {
    if (!effectiveType) return listRaw;
    return listRaw.filter((t) => (t.type || '') === effectiveType);
  }, [listRaw, effectiveType]);
  const listDisplayed = useMemo(() => {
    let rows = list;
    if (monthFilter) {
      rows = rows.filter((t) => String(t.date ?? '').slice(0, 7) === monthFilter);
    }
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter(
      (t) =>
        String(t.description || '').toLowerCase().includes(q) ||
        String(t.reference || '').toLowerCase().includes(q) ||
        String(transactionCategoryLabel(t.category) || '').toLowerCase().includes(q) ||
        String(t.type || '').toLowerCase().includes(q)
    );
  }, [list, tableSearch, monthFilter]);
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
    setDeleteTarget({ id, description: row.description || 'this transaction' });
  }

  function confirmDelete() {
    const id = deleteTarget?.id;
    if (!id) return;
    deleteMutation.mutate(id, {
      onSettled: () => setDeleteTarget(null),
    });
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const colCount = 9;
  const totals = meta?.totals ?? {};
  const totalsShown = useMemo(() => {
    if (!tableSearch.trim() && !monthFilter) return totals;
    let debit = 0;
    let credit = 0;
    let net = 0;
    for (const t of listDisplayed) {
      const { rowDebit, rowCredit, rowNet } = getTransactionRowDebitCreditNet(t);
      debit += Number(rowDebit) || 0;
      credit += Number(rowCredit) || 0;
      net += Number(rowNet) || 0;
    }
    return { debit, credit, net };
  }, [listDisplayed, tableSearch, monthFilter, totals]);

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">{effectiveType === 'expense' ? 'Expenses' : 'Transactions'}</div>
          <div className="page-subtitle">
            {effectiveType === 'expense'
              ? 'Expense entries (posted to the ledger when accounting is configured)'
              : 'Income and expense entries (posted to the ledger when accounting is configured)'}
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <i className="fas fa-plus" /> Add
        </button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search description, reference, category…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />

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
                    {form.type === 'refund' ? (
                      <input
                        id="tx-category"
                        className="form-control"
                        disabled
                        value="refund"
                        readOnly
                      />
                    ) : (
                      <>
                        <input
                          id="tx-category"
                          className="form-control"
                          list="tx-category-datalist"
                          required
                          value={form.category}
                          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                          placeholder="Choose a suggestion or type your own"
                          autoComplete="off"
                        />
                        <datalist id="tx-category-datalist">
                          {TRANSACTION_CATEGORY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </datalist>
                        <p className="transactions-form-hint">
                          Presets match the ledger; any other text is sent as a category code (e.g. &quot;council rates&quot; →{' '}
                          <code>council_rates</code>).
                        </p>
                      </>
                    )}
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
                      {accountSelectOptions.map((o) => (
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
                      {accountSelectOptions.map((o) => (
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

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete transaction"
        message={`Delete "${deleteTarget?.description || 'this transaction'}"? This cannot be undone.`}
        confirmLabel="Delete transaction"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        busy={deleteMutation.isPending}
        tone="danger"
      />

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
                {!isLoading && listDisplayed.length === 0 && (
                  <tr>
                    <td colSpan={colCount}>No transactions</td>
                  </tr>
                )}
                {!isLoading &&
                  listDisplayed.map((t) => {
                    const id = t._id ?? t.id;
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
                  <td colSpan={4}>
                    <strong>Totals</strong>
                    {tableSearch.trim() || monthFilter ? (
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                        (filtered view on this page)
                      </span>
                    ) : null}
                  </td>
                  <td className="statement-table-num pl-neg"><strong>{moneyOrBlank(totalsShown.debit)}</strong></td>
                  <td className="statement-table-num pl-pos"><strong>{moneyOrBlank(totalsShown.credit)}</strong></td>
                  <td className={'statement-table-num ' + ((Number(totalsShown.net ?? 0)) >= 0 ? 'pl-pos' : 'pl-neg')}>
                    <strong>{moneyOrBlank(totalsShown.net)}</strong>
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
