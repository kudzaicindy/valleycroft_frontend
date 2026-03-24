import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/api/finance';
import { ACCOUNT_OPTIONS } from '@/constants/financeAccounts';
import { buildTransactionWritePayload } from '@/utils/transactionWritePayload';
import { formatTransactionMutationMessage } from '@/utils/apiError';
import { newIdempotencyKey, isTransactionLedgerPosted } from '@/utils/transactionLedgerUi';

const LIMIT = 20;

function moneyOrBlank(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

function buildRefundDescription(guestName, reason) {
  const g = String(guestName || '').trim();
  const r = String(reason || '').trim();
  if (!r) return '';
  if (g) return `${g} — ${r}`;
  return r;
}

const emptyForm = () => ({
  guestName: '',
  reason: '',
  amount: '',
  debitAccount: '4000',
  creditAccount: '1000',
  date: '',
  reference: '',
  booking: '',
});

export default function RefundsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', 'refunds', page],
    queryFn: () => getTransactions({ page, limit: LIMIT, category: 'refund' }),
  });

  const listRaw = Array.isArray(data) ? data : (data?.data ?? data?.transactions ?? []);
  const list = listRaw.filter((t) => t.category === 'refund');
  const meta = data?.meta ?? {};

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row) => {
    setEditingId(row._id ?? row.id);
    setForm({
      guestName: '',
      reason: row.description || '',
      amount: row.amount != null ? String(row.amount) : '',
      debitAccount: String(row.debitAccount || row.debitAccountCode || '4000'),
      creditAccount: String(row.creditAccount || row.creditAccountCode || '1000'),
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

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: ({ body, idempotencyKey }) => createTransaction(body, { idempotencyKey }),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
    onError: (err) => {
      setSaveError(formatTransactionMutationMessage(err).join('\n'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateTransaction(id, body),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
    onError: (err) => {
      setSaveError(formatTransactionMutationMessage(err).join('\n'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteTransaction(id),
    onSuccess: () => invalidate(),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setSaveError(null);
    const description = editingId
      ? String(form.reason || '').trim()
      : buildRefundDescription(form.guestName, form.reason);
    try {
      const body = buildTransactionWritePayload({
        type: 'refund',
        category: 'refund',
        description,
        amount: form.amount,
        debitAccount: form.debitAccount,
        creditAccount: form.creditAccount,
        date: form.date,
        reference: form.reference,
        booking: form.booking,
      });
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
    if (!window.confirm('Delete this refund transaction? This cannot be undone.')) return;
    deleteMutation.mutate(id);
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const colCount = 7;

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Refunds</div>
          <div className="page-subtitle">
            Record refunds as finance transactions (same ledger flow as Transactions). They use category
            &quot;Refund&quot; and appear on the Transactions page.
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <i className="fas fa-plus" /> Add refund
        </button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      {modalOpen && (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refunds-modal-title"
          onClick={closeModal}
        >
          <div className="transactions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="refunds-modal-title">{editingId ? 'Edit refund' : 'Add refund'}</h3>
              <button type="button" className="transactions-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form onSubmit={handleSubmit}>
                <div className="transactions-form-grid">
                  {!editingId && (
                    <div className="transactions-form-field">
                      <label htmlFor="rf-guest">Guest name</label>
                      <input
                        id="rf-guest"
                        className="form-control"
                        value={form.guestName}
                        onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                  )}
                  <div className={`transactions-form-field ${editingId ? 'transactions-form-field--wide' : ''}`}>
                    <label htmlFor="rf-reason">{editingId ? 'Description' : 'Reason'}</label>
                    <input
                      id="rf-reason"
                      className="form-control"
                      value={form.reason}
                      onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                      required
                      placeholder={editingId ? 'Full description' : 'Why this refund was issued'}
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="rf-amount">Amount (ZAR)</label>
                    <input
                      id="rf-amount"
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
                    <label htmlFor="rf-debit">Account to debit</label>
                    <select
                      id="rf-debit"
                      className="form-control"
                      required
                      value={form.debitAccount}
                      onChange={(e) => setForm((f) => ({ ...f, debitAccount: e.target.value }))}
                    >
                      {ACCOUNT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="rf-credit">Account to credit</label>
                    <select
                      id="rf-credit"
                      className="form-control"
                      required
                      value={form.creditAccount}
                      onChange={(e) => setForm((f) => ({ ...f, creditAccount: e.target.value }))}
                    >
                      {ACCOUNT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="rf-date">Date</label>
                    <input
                      id="rf-date"
                      type="date"
                      className="form-control"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="rf-ref">Booking / reference</label>
                    <input
                      id="rf-ref"
                      className="form-control"
                      value={form.reference}
                      onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                      placeholder="Booking ref, invoice #…"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="rf-booking">Booking ID</label>
                    <input
                      id="rf-booking"
                      className="form-control"
                      value={form.booking}
                      onChange={(e) => setForm((f) => ({ ...f, booking: e.target.value }))}
                      placeholder="Optional linked booking id"
                    />
                  </div>
                </div>
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
                  <th>Description</th>
                  <th>Reference</th>
                  <th className="statement-table-num">Debit</th>
                  <th className="statement-table-num">Credit</th>
                  <th>Ledger</th>
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
                    <td colSpan={colCount}>No refund transactions yet. Add one to post it like any other entry.</td>
                  </tr>
                )}
                {!isLoading &&
                  list.map((t) => {
                    const id = t._id ?? t.id;
                    const jid = t.journalEntryId;
                    const posted = isTransactionLedgerPosted(t);
                    const rowDebit = t.debit ?? t.amount;
                    const rowCredit = t.credit ?? t.amount;
                    return (
                      <tr key={id || JSON.stringify(t)}>
                        <td>{t.date || '—'}</td>
                        <td>{t.description || '—'}</td>
                        <td>{t.reference || '—'}</td>
                        <td className="statement-table-num pl-neg">{moneyOrBlank(rowDebit)}</td>
                        <td className="statement-table-num pl-pos">{moneyOrBlank(rowCredit)}</td>
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
            </p>
          )}
          {(meta.total || 0) > LIMIT && (
            <div className="pagination-bar">
              <span className="pagination-info">Page {meta.page ?? page}</span>
              <div className="pagination-btns">
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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
