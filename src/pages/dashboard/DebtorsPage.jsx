import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDebtors, updateDebtor } from '@/api/debtors';

const LIMIT = 20;
function fmt(n) { return n == null ? '—' : 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 }); }

export default function DebtorsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedDebtor, setSelectedDebtor] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payError, setPayError] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['debtors', page],
    queryFn: () => getDebtors({ page, limit: LIMIT }),
  });
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  const updateDebtorMutation = useMutation({
    mutationFn: ({ id, body }) => updateDebtor(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      setSelectedDebtor(null);
      setPayAmount('');
      setPayReference('');
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayError('');
    },
    onError: (err) => {
      setPayError(err?.message || 'Could not record payment.');
    },
  });

  const selectedBalance = useMemo(() => {
    if (!selectedDebtor) return 0;
    const bal = Number(selectedDebtor.balance ?? (selectedDebtor.amountOwed - (selectedDebtor.amountPaid || 0)));
    return Number.isFinite(bal) ? bal : 0;
  }, [selectedDebtor]);

  function openRecordPaymentModal(d) {
    setSelectedDebtor(d);
    setPayAmount('');
    setPayReference('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayError('');
  }

  function closeRecordPaymentModal() {
    if (updateDebtorMutation.isPending) return;
    setSelectedDebtor(null);
    setPayError('');
  }

  function submitRecordPayment(e) {
    e.preventDefault();
    if (!selectedDebtor) return;
    const debtorId = selectedDebtor._id ?? selectedDebtor.id;
    if (!debtorId) {
      setPayError('Could not determine debtor ID for this record.');
      return;
    }
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayError('Enter a valid payment amount greater than 0.');
      return;
    }
    const currentOwed = Number(selectedDebtor.amountOwed || 0);
    const currentPaid = Number(selectedDebtor.amountPaid || 0);
    const nextPaid = currentPaid + amt;
    const nextBalance = Math.max(currentOwed - nextPaid, 0);
    const nextStatus = nextBalance <= 0 ? 'paid' : (nextPaid > 0 ? 'partial' : 'outstanding');
    const paymentRef = String(payReference || '').trim();
    const paymentDate = String(payDate || '').trim();
    const body = {
      amountPaid: nextPaid,
      status: nextStatus,
      ...(paymentDate ? { paymentDate } : {}),
      ...(paymentRef ? { paymentReference: paymentRef } : {}),
    };
    updateDebtorMutation.mutate({ id: debtorId, body });
  }

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Debtors</div>
          <div className="page-subtitle">Outstanding amounts and aging</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm"><i className="fas fa-plus" /> Add</button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Amount owed</th><th>Paid</th><th className="statement-table-num">Balance</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={7}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={7}>No debtors</td></tr>}
                {!isLoading && list.map((d, idx) => (
                  <tr key={d._id ?? d.id ?? `${d.name || 'debtor'}-${d.contactEmail || d.contactPhone || idx}`}>
                    <td><strong>{d.name || '—'}</strong></td>
                    <td>{d.contactEmail || d.contactPhone || '—'}</td>
                    <td className="statement-table-num">{fmt(d.amountOwed)}</td>
                    <td className="statement-table-num">{fmt(d.amountPaid)}</td>
                    <td className="statement-table-num">{fmt(d.balance ?? (d.amountOwed - (d.amountPaid || 0)))}</td>
                    <td><span className={'badge ' + (d.status === 'paid' ? 'badge-paid' : 'badge-pending')}>{d.status || 'outstanding'}</span></td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => openRecordPaymentModal(d)}
                      >
                        Record payment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(meta.total || 0) > LIMIT && (
            <div className="pagination-bar">
              <span className="pagination-info">Page {meta.page ?? page}</span>
              <div className="pagination-btns">
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= Math.ceil((meta.total || 0) / LIMIT)} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedDebtor && (
        <div className="transactions-modal-overlay" role="dialog" aria-modal="true" onClick={closeRecordPaymentModal}>
          <div className="transactions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3>Record payment</h3>
              <button type="button" className="transactions-modal-close" onClick={closeRecordPaymentModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form onSubmit={submitRecordPayment}>
                <div style={{ marginBottom: 10, fontSize: 12 }}>
                  <strong>{selectedDebtor.name || 'Debtor'}</strong> · Outstanding: <strong>{fmt(selectedBalance)}</strong>
                </div>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field">
                    <label htmlFor="pay-amount">Amount *</label>
                    <input
                      id="pay-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="form-control"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="pay-date">Date</label>
                    <input
                      id="pay-date"
                      type="date"
                      className="form-control"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="pay-ref">Reference</label>
                    <input
                      id="pay-ref"
                      className="form-control"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="Receipt / transfer ref"
                    />
                  </div>
                </div>
                {payError && (
                  <div className="card card--error" style={{ marginTop: 12 }}>
                    <div className="card-body">{payError}</div>
                  </div>
                )}
                <div className="transactions-modal-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={closeRecordPaymentModal} disabled={updateDebtorMutation.isPending}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={updateDebtorMutation.isPending}>
                    {updateDebtorMutation.isPending ? 'Saving…' : 'Record payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
