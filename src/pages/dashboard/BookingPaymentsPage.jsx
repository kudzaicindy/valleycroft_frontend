import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getBookings } from '@/api/bookings';
import { createTransaction } from '@/api/finance';
import { ACCOUNT_OPTIONS } from '@/constants/financeAccounts';
import { buildTransactionWritePayload } from '@/utils/transactionWritePayload';
import { formatTransactionMutationMessage } from '@/utils/apiError';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import { parseLocalDate } from '@/utils/availability';
import { newIdempotencyKey } from '@/utils/transactionLedgerUi';
import {
  bookingReferenceDisplay,
  bookingTotalAmount,
  bookingGuestLabel,
} from '@/utils/bookingDisplay';
import { listFromSuccessEnvelope } from '@/utils/apiEnvelope';

const LIMIT = 150;

const ELIGIBLE_STATUS = new Set(['confirmed', 'checked-in', 'checked-out']);

function statusStr(s) {
  if (s == null) return '';
  if (typeof s === 'string') return s;
  if (typeof s === 'object' && s != null && typeof s.value === 'string') return s.value;
  return String(s);
}

function statusBadgeClass(s) {
  const v = statusStr(s).toLowerCase();
  if (v === 'confirmed') return 'badge-confirmed';
  if (v === 'checked-in' || v === 'checked-out') return 'badge-confirmed';
  return 'badge-pending';
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

function roomLabel(b) {
  const r = b.room ?? b.roomId;
  if (r == null) return '—';
  if (typeof r === 'object' && r.name) return r.name;
  return String(r);
}

function dateRangeLabel(b) {
  const ci = b.checkIn || b.eventDate;
  const co = b.checkOut;
  if (ci && co) {
    const a = parseLocalDate(String(ci).slice(0, 10));
    const c = parseLocalDate(String(co).slice(0, 10));
    if (a && c) return `${formatDateDayMonthYear(a)} → ${formatDateDayMonthYear(c)}`;
  }
  if (ci) {
    const a = parseLocalDate(String(ci).slice(0, 10));
    if (a) return formatDateDayMonthYear(a);
  }
  return '—';
}

function defaultPaymentForm(booking) {
  const id = booking?._id ?? booking?.id;
  const ref = booking ? bookingReferenceDisplay(booking) : '';
  const guest = booking ? bookingGuestLabel(booking) : '';
  const total = booking ? bookingTotalAmount(booking) : 0;
  const today = new Date().toISOString().slice(0, 10);
  return {
    amount: total > 0 ? String(total) : '',
    date: today,
    debitAccount: '1020',
    creditAccount: '1010',
    reference: ref && ref !== '—' ? `PAY-BOOK-${String(ref).replace(/\s+/g, '').slice(0, 14)}` : '',
    description: booking
      ? `Guest payment — ${guest} (${ref})`
      : '',
    booking: id != null ? String(id) : '',
  };
}

export default function BookingPaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentBooking, setPaymentBooking] = useState(null);
  const [form, setForm] = useState(() => defaultPaymentForm(null));
  const [saveError, setSaveError] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['bookings', 'finance-payments', LIMIT],
    queryFn: () => getBookings({ page: 1, limit: LIMIT }),
  });

  const rawList = useMemo(() => listFromSuccessEnvelope(data), [data]);

  const eligible = useMemo(() => {
    return rawList.filter((b) => ELIGIBLE_STATUS.has(statusStr(b).toLowerCase()));
  }, [rawList]);

  const list = useMemo(() => {
    if (!search.trim()) return eligible;
    const q = search.trim().toLowerCase();
    return eligible.filter(
      (b) =>
        bookingGuestLabel(b).toLowerCase().includes(q) ||
        String(b.guestEmail || '')
          .toLowerCase()
          .includes(q) ||
        bookingReferenceDisplay(b).toLowerCase().includes(q) ||
        roomLabel(b).toLowerCase().includes(q)
    );
  }, [eligible, search]);

  /** Confirmed-only list for the primary picker; current modal booking is appended if opened from a table row with another status. */
  const confirmedForSelect = useMemo(
    () => eligible.filter((b) => statusStr(b).toLowerCase() === 'confirmed'),
    [eligible]
  );

  const bookingSelectOptions = useMemo(() => {
    const ids = new Set(confirmedForSelect.map((b) => String(b._id ?? b.id)));
    const cur = paymentBooking;
    const curId = cur ? String(cur._id ?? cur.id) : '';
    if (cur && curId && !ids.has(curId)) return [...confirmedForSelect, cur];
    return confirmedForSelect;
  }, [confirmedForSelect, paymentBooking]);

  const openPayment = useCallback((b) => {
    setPaymentBooking(b);
    setForm(defaultPaymentForm(b));
    setSaveError(null);
    setPaymentModalOpen(true);
  }, []);

  const openAddPayment = useCallback(() => {
    setPaymentBooking(null);
    setForm(defaultPaymentForm(null));
    setSaveError(null);
    setPaymentModalOpen(true);
  }, []);

  const closePayment = useCallback(() => {
    setPaymentModalOpen(false);
    setPaymentBooking(null);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!paymentModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closePayment();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paymentModalOpen, closePayment]);

  const createMutation = useMutation({
    mutationFn: ({ body, idempotencyKey }) => createTransaction(body, { idempotencyKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      closePayment();
    },
    onError: (err) => {
      setSaveError(formatTransactionMutationMessage(err).join('\n'));
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaveError(null);
    if (!form.booking?.trim()) {
      setSaveError('Select a confirmed booking before saving.');
      return;
    }
    try {
      const body = buildTransactionWritePayload({
        type: 'income',
        category: 'booking',
        description: form.description,
        amount: form.amount,
        debitAccount: form.debitAccount,
        creditAccount: form.creditAccount,
        date: form.date,
        reference: form.reference,
        booking: form.booking,
      });
      createMutation.mutate({ body, idempotencyKey: newIdempotencyKey() });
    } catch (ve) {
      if (ve?.code === 'VALIDATION') setSaveError(ve.message);
      else setSaveError(ve?.message || 'Invalid form.');
    }
  };

  const bankCashOptions = ACCOUNT_OPTIONS.filter((o) => o.value === '1000' || o.value === '1020');

  return (
    <div className="page-stack booking-payments-page">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Booking payments</div>
          <div className="page-subtitle">
            Record cash or bank receipts against confirmed stays. Each save posts a{' '}
            <strong>transaction</strong> (Dr bank/cash, Cr accounts receivable) linked to the booking
            {String(user?.role || '').toLowerCase() === 'finance' ? (
              <>
                {' '}
                — same screen as Finance → <Link to="/finance/transactions">Transactions</Link>.
              </>
            ) : (
              <> — Finance can review entries under Transactions.</>
            )}
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAddPayment}>
          <i className="fas fa-plus" aria-hidden /> Record payment
        </button>
      </div>

      {error && (
        <div className="card card--error">
          <div className="card-body">{error.message}</div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <div className="booking-payments-toolbar">
            <label className="booking-payments-search-label" htmlFor="bp-search">
              Search bookings
            </label>
            <input
              id="bp-search"
              type="search"
              className="form-control booking-payments-search"
              placeholder="Guest, email, reference, room…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <p className="booking-payments-hint">
              Showing {list.length} of {eligible.length} eligible reservations (confirmed, checked-in, or checked-out).
              Revenue is usually recognised when a booking is confirmed (Dr revenue / Cr receivable); use this screen when
              money is received (Dr bank / Cr receivable).
            </p>
          </div>
        </div>
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table booking-payments-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Guest</th>
                  <th>Status</th>
                  <th>Dates</th>
                  <th>Room / type</th>
                  <th className="statement-table-num">Total</th>
                  <th className="statement-table-num">Deposit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8}>Loading bookings…</td>
                  </tr>
                ) : null}
                {!isLoading && list.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      No eligible bookings in this list. Reservations must be at least <strong>confirmed</strong> before
                      you record payments here (operations confirms them in the admin bookings workflow).
                    </td>
                  </tr>
                ) : null}
                {!isLoading &&
                  list.map((b) => {
                    const id = b._id ?? b.id;
                    return (
                      <tr key={id || JSON.stringify(b)}>
                        <td className="booking-payments-ref">{bookingReferenceDisplay(b)}</td>
                        <td>
                          <div className="booking-payments-guest">{bookingGuestLabel(b)}</div>
                          {b.guestEmail ? (
                            <div className="booking-payments-email">{b.guestEmail}</div>
                          ) : null}
                        </td>
                        <td>
                          <span className={'badge ' + statusBadgeClass(b.status)}>{statusStr(b.status) || '—'}</span>
                        </td>
                        <td className="booking-payments-dates">{dateRangeLabel(b)}</td>
                        <td className="booking-payments-room">
                          {roomLabel(b)}
                          {b.type ? (
                            <span className="booking-payments-type">{String(b.type)}</span>
                          ) : null}
                        </td>
                        <td className="statement-table-num">{fmtMoney(bookingTotalAmount(b))}</td>
                        <td className="statement-table-num">{fmtMoney(b.deposit)}</td>
                        <td className="booking-payments-actions">
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => openPayment(b)}>
                            Record payment
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {paymentModalOpen && (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bp-modal-title"
          onClick={closePayment}
        >
          <div className="transactions-modal booking-payments-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="bp-modal-title">Record payment</h3>
              <button type="button" className="transactions-modal-close" onClick={closePayment} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label" htmlFor="bp-booking-select">
                  Confirmed booking *
                </label>
                <select
                  id="bp-booking-select"
                  className="form-control"
                  value={form.booking}
                  onChange={(e) => {
                    const id = e.target.value;
                    const b = bookingSelectOptions.find((x) => String(x._id ?? x.id) === id);
                    if (b) {
                      setPaymentBooking(b);
                      setForm(defaultPaymentForm(b));
                    } else {
                      setPaymentBooking(null);
                      setForm(defaultPaymentForm(null));
                    }
                    setSaveError(null);
                  }}
                >
                  <option value="">Choose a confirmed booking…</option>
                  {bookingSelectOptions.map((b) => {
                    const bid = b._id ?? b.id;
                    return (
                      <option key={bid} value={String(bid)}>
                        {bookingReferenceDisplay(b)} — {bookingGuestLabel(b)}
                        {statusStr(b).toLowerCase() !== 'confirmed' ? ` (${statusStr(b)})` : ''}
                      </option>
                    );
                  })}
                </select>
                {confirmedForSelect.length === 0 && (
                  <p className="booking-payments-hint" style={{ marginTop: 8 }}>
                    No <strong>confirmed</strong> bookings in the current list. Confirm a reservation in Bookings first, or use a row that is
                    already confirmed below.
                  </p>
                )}
              </div>
              {paymentBooking ? (
                <div className="booking-payments-modal-summary">
                  <div>
                    <strong>{bookingGuestLabel(paymentBooking)}</strong>
                    <span className="booking-payments-modal-ref">{bookingReferenceDisplay(paymentBooking)}</span>
                  </div>
                  <div className="booking-payments-modal-meta">
                    Booking total {fmtMoney(bookingTotalAmount(paymentBooking))}
                    {paymentBooking.deposit != null && Number(paymentBooking.deposit) > 0
                      ? ` · Deposit recorded R ${Number(paymentBooking.deposit).toLocaleString('en-ZA')}`
                      : null}
                  </div>
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  Pick which guest stay this receipt applies to. Amount and accounts can be adjusted after you select.
                </p>
              )}
              <form onSubmit={handleSubmit}>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field">
                    <label htmlFor="bp-amount">Amount received (ZAR)</label>
                    <input
                      id="bp-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-control"
                      required
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="bp-date">Payment date</label>
                    <input
                      id="bp-date"
                      type="date"
                      className="form-control"
                      required
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="bp-debit">Receive into (debit)</label>
                    <select
                      id="bp-debit"
                      className="form-control"
                      value={form.debitAccount}
                      onChange={(e) => setForm((f) => ({ ...f, debitAccount: e.target.value }))}
                    >
                      {bankCashOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="bp-credit">Clear receivable (credit)</label>
                    <select
                      id="bp-credit"
                      className="form-control"
                      value={form.creditAccount}
                      onChange={(e) => setForm((f) => ({ ...f, creditAccount: e.target.value }))}
                    >
                      {ACCOUNT_OPTIONS.filter((o) => o.value === '1010').map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="bp-desc">Description</label>
                    <input
                      id="bp-desc"
                      className="form-control"
                      required
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="bp-ref">Reference (optional)</label>
                    <input
                      id="bp-ref"
                      className="form-control"
                      value={form.reference}
                      onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                      placeholder="e.g. PAY-BOOK-…"
                    />
                  </div>
                </div>
                <p className="chart-of-accounts-api-note">
                  Creates <code>POST /api/finance/transactions</code> with <code>type: income</code>,{' '}
                  <code>category: booking</code>, and <code>booking</code> set to this reservation id.
                </p>
                {saveError && (
                  <div className="card card--error" style={{ marginTop: 12 }}>
                    <div className="card-body" style={{ whiteSpace: 'pre-line', fontSize: 13 }}>
                      {saveError}
                    </div>
                  </div>
                )}
                <div className="transactions-modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={closePayment}
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Saving…' : 'Create transaction'}
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
