import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getPendingBookingDebtors, recordDebtorPayment } from '@/api/debtors';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import { parseLocalDate } from '@/utils/availability';
import {
  bookingReferenceDisplay,
  bookingTotalAmount,
  bookingGuestLabel,
} from '@/utils/bookingDisplay';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { listFromSuccessEnvelope } from '@/utils/apiEnvelope';

const LIMIT = 300;

function statusStr(s) {
  if (s == null) return '';
  if (typeof s === 'string') return s;
  if (typeof s === 'object' && s != null && typeof s.value === 'string') return s.value;
  return String(s);
}

function statusBadgeClass(s) {
  const v = statusStr(s).toLowerCase();
  if (v === 'paid') return 'badge-paid';
  if (v === 'partial' || v === 'outstanding') return 'badge-pending';
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

function bookingDateLabel(value) {
  if (!value) return '—';
  const parsed = parseLocalDate(String(value).slice(0, 10));
  return parsed ? formatDateDayMonthYear(parsed) : '—';
}

function toPaymentRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const booking =
    raw.guestBookingRef ||
    raw.bookingRef ||
    raw.guest_booking_ref ||
    raw.booking ||
    raw.guestBooking ||
    raw.guest_booking ||
    raw.bookingDetails ||
    {};
  const invoice = raw.invoiceRef || raw.invoice_ref || raw.invoice || null;
  const debtorId = raw._id ?? raw.id ?? raw.debtorId ?? raw.debtor_id;
  const amountOwed = Number(raw.amountOwed ?? raw.amount_owed ?? raw.totalAmount ?? bookingTotalAmount(booking) ?? 0) || 0;
  const amountPaid = Number(raw.amountPaid ?? raw.amount_paid ?? 0) || 0;
  const balance = Number(raw.balance ?? Math.max(0, amountOwed - amountPaid)) || 0;
  return {
    ...booking,
    _raw: raw,
    debtorId: debtorId != null ? String(debtorId) : '',
    guestName: raw.name || raw.guestName || booking.guestName || raw.guest?.name || bookingGuestLabel(booking),
    guestEmail: raw.contactEmail || raw.guestEmail || booking.guestEmail || raw.guest?.email || '',
    guestPhone: raw.contactPhone || raw.guestPhone || booking.guestPhone || '',
    reference:
      booking.trackingCode ||
      raw.trackingCode ||
      raw.reference ||
      raw.bookingReference ||
      booking.reference ||
      booking.bookingReference ||
      raw.invoice?.invoiceNumber ||
      '',
    description: raw.description || '',
    status: raw.status || 'outstanding',
    platform:
      raw.platform ||
      raw.source ||
      booking.platform ||
      booking.source ||
      'direct',
    amountOwed,
    amountPaid,
    balance,
    invoiceId: invoice?._id ? String(invoice._id) : '',
    invoiceStatus: invoice?.status || '',
    invoiceDueDate: invoice?.dueDate || '',
    invoiceTotal: Number(invoice?.total ?? 0) || 0,
  };
}

function defaultPaymentForm(booking) {
  const debtorId = booking?.debtorId || '';
  const ref = booking ? bookingReferenceDisplay(booking) : '';
  const guest = booking ? bookingGuestLabel(booking) : '';
  const outstanding = booking ? Number(booking.balance ?? 0) || 0 : 0;
  const today = new Date().toISOString().slice(0, 10);
  return {
    amount: outstanding > 0 ? String(outstanding) : '',
    date: today,
    reference: ref && ref !== '—' ? `PAY-BOOK-${String(ref).replace(/\s+/g, '').slice(0, 14)}` : '',
    note: booking
      ? `Guest payment — ${guest} (${ref})`
      : '',
    debtorId,
  };
}

export default function BookingPaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentBooking, setPaymentBooking] = useState(null);
  const [form, setForm] = useState(() => defaultPaymentForm(null));
  const [saveError, setSaveError] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['debtors', 'pending-bookings', LIMIT],
    queryFn: () => getPendingBookingDebtors({ page: 1, limit: LIMIT }),
  });

  const rawList = useMemo(() => listFromSuccessEnvelope(data), [data]);
  const eligible = useMemo(() => rawList.map(toPaymentRow).filter(Boolean), [rawList]);

  const list = useMemo(() => {
    let rows = eligible;
    if (monthFilter) {
      rows = rows.filter((b) => {
        const ci = b.checkIn || b.eventDate;
        const m = ci != null && String(ci).length >= 7 ? String(ci).slice(0, 7) : '';
        if (!m) return true;
        return m === monthFilter;
      });
    }
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (b) =>
        bookingGuestLabel(b).toLowerCase().includes(q) ||
        String(b.guestEmail || '')
          .toLowerCase()
          .includes(q) ||
        String(b.guestPhone || '')
          .toLowerCase()
          .includes(q) ||
        bookingReferenceDisplay(b).toLowerCase().includes(q) ||
        roomLabel(b).toLowerCase().includes(q)
    );
  }, [eligible, search, monthFilter]);

  const outstandingBookings = useMemo(() => {
    return eligible
      .map((b) => ({ booking: b, outstanding: Number(b.balance ?? 0) || 0 }))
      .filter((x) => x.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [eligible]);

  const bookingSelectOptions = useMemo(() => {
    // Primary picker should prioritize bookings that still owe money.
    const fromOutstanding = outstandingBookings.map((x) => x.booking);
    const base = fromOutstanding.length > 0 ? fromOutstanding : eligible;
    const ids = new Set(base.map((b) => String(b._id ?? b.id)));
    const cur = paymentBooking;
    const curId = cur ? String(cur._id ?? cur.id) : '';
    if (cur && curId && !ids.has(curId)) return [...base, cur];
    return base;
  }, [outstandingBookings, eligible, paymentBooking]);

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
    mutationFn: async ({ debtorId, body }) => {
      return recordDebtorPayment(debtorId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      closePayment();
    },
    onError: (err) => {
      setSaveError(err?.message || 'Could not record payment.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaveError(null);
    if (!form.debtorId?.trim()) {
      setSaveError('Select a booking debtor before saving.');
      return;
    }
    try {
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setSaveError('Amount must be greater than zero.');
        return;
      }
      const body = {
        amount,
        note: form.note || '',
        ...(form.date ? { paidAt: new Date(`${form.date}T12:00:00`).toISOString() } : {}),
      };
      createMutation.mutate({ debtorId: form.debtorId, body, booking: paymentBooking });
    } catch (ve) {
      setSaveError(ve?.message || 'Invalid form.');
    }
  };

  return (
    <div className="page-stack booking-payments-page">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Booking payments</div>
          <div className="page-subtitle">
            Record receipts against booking debtors with outstanding balances
            {String(user?.role || '').toLowerCase() === 'finance' ? (
              <>
                {' '}
                — pending list is sourced from <code>/api/debtors/pending-bookings</code>.
              </>
            ) : (
              <> — Finance can review and settle outstanding booking debtors.</>
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
            <DashboardListFilters
              embedded
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Guest name, email, phone, reference, room…"
              month={monthFilter}
              onMonthChange={setMonthFilter}
            />
            <p className="booking-payments-hint">
              Showing {list.length} of {eligible.length} booking debtors with balances pending.
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
                  <th>Platform</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Room / type</th>
                  <th className="statement-table-num">Amount owed</th>
                  <th className="statement-table-num">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10}>Loading bookings…</td>
                  </tr>
                ) : null}
                {!isLoading && list.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      No pending booking debtors found.
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
                          <div className="booking-payments-guest">
                            {String(b.guestName || '').trim() || bookingGuestLabel(b)}
                          </div>
                          {b.guestEmail ? <div className="booking-payments-email">{b.guestEmail}</div> : null}
                          {b.guestPhone ? <div className="booking-payments-email">{b.guestPhone}</div> : null}
                        </td>
                        <td>
                          <span className={'badge ' + statusBadgeClass(b.status)}>{statusStr(b.status) || '—'}</span>
                        </td>
                        <td>{String(b.platform || 'direct')}</td>
                        <td>{bookingDateLabel(b.checkIn || b.eventDate)}</td>
                        <td>{bookingDateLabel(b.checkOut)}</td>
                        <td className="booking-payments-room">
                          {roomLabel(b)}
                          {b.type ? (
                            <span className="booking-payments-type">{String(b.type)}</span>
                          ) : null}
                        </td>
                        <td className="statement-table-num">{fmtMoney(b.amountOwed)}</td>
                        <td className="statement-table-num"><strong>{fmtMoney(b.balance)}</strong></td>
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
                  Booking with outstanding balance *
                </label>
                <select
                  id="bp-booking-select"
                  className="form-control"
                  value={form.debtorId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const b = bookingSelectOptions.find((x) => String(x.debtorId) === id);
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
                  <option value="">Choose a booking…</option>
                  {bookingSelectOptions.map((b) => {
                    const bid = b._id ?? b.id;
                    const nm = String(b.guestName || '').trim() || bookingGuestLabel(b);
                    const em = String(b.guestEmail || '').trim();
                    const ph = String(b.guestPhone || '').trim();
                    const guestLine = [nm, em || null, ph || null].filter(Boolean).join(' · ');
                    return (
                      <option key={bid} value={String(b.debtorId || bid)}>
                        {guestLine}
                        {bookingReferenceDisplay(b) !== '—' ? ` (${bookingReferenceDisplay(b)})` : ''}
                        {statusStr(b.status) ? ` — ${statusStr(b.status)}` : ''}
                      </option>
                    );
                  })}
                </select>
                {bookingSelectOptions.length === 0 && (
                  <p className="booking-payments-hint" style={{ marginTop: 8 }}>
                    No eligible bookings with balances found in the current list.
                  </p>
                )}
              </div>
              {outstandingBookings.length > 0 ? (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <div className="form-label">Unpaid / outstanding booking guests</div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 2 }}>
                    {outstandingBookings.map(({ booking: b, outstanding }) => {
                      const bid = String(b._id ?? b.id ?? '');
                      return (
                        <button
                          key={`out-${bid}`}
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ justifyContent: 'space-between' }}
                          onClick={() => {
                            setPaymentBooking(b);
                            setForm(defaultPaymentForm(b));
                            setSaveError(null);
                          }}
                        >
                          <span style={{ textAlign: 'left' }}>
                            <div>{String(b.guestName || '').trim() || bookingGuestLabel(b)}</div>
                            {b.guestEmail ? <div className="text-muted">{b.guestEmail}</div> : null}
                            {b.guestPhone ? <div className="text-muted">{b.guestPhone}</div> : null}
                          </span>
                          <strong>{fmtMoney(outstanding)}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <p className="booking-payments-hint" style={{ marginTop: 8 }}>
                    Quick-pick guests with outstanding balances. The amount field auto-fills with the selected balance.
                  </p>
                </div>
              ) : null}
              {paymentBooking ? (
                <div className="booking-payments-modal-summary">
                  <div>
                    <strong>
                      {String(paymentBooking.guestName || '').trim() || bookingGuestLabel(paymentBooking)}
                    </strong>
                  </div>
                  {paymentBooking.guestEmail ? (
                    <div className="booking-payments-email">{paymentBooking.guestEmail}</div>
                  ) : null}
                  {paymentBooking.guestPhone ? (
                    <div className="booking-payments-email">{paymentBooking.guestPhone}</div>
                  ) : null}
                  <div className="booking-payments-modal-meta">
                    Ref {bookingReferenceDisplay(paymentBooking)} · Amount owed {fmtMoney(paymentBooking.amountOwed)} ·
                    Balance {fmtMoney(paymentBooking.balance)}
                    {paymentBooking.invoiceStatus ? ` · Invoice ${paymentBooking.invoiceStatus}` : ''}
                    {paymentBooking.invoiceDueDate ? ` · Due ${String(paymentBooking.invoiceDueDate).slice(0, 10)}` : ''}
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
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="bp-desc">Note</label>
                    <input
                      id="bp-desc"
                      className="form-control"
                      value={form.note}
                      onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
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
                  Saves via <code>POST /api/debtors/:id/payments</code> and relies on backend journal posting for the
                  double-entry transaction.
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
                    {createMutation.isPending ? 'Saving…' : 'Record payment'}
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
