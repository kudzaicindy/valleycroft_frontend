import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  getPendingBookingDebtors,
  recordDebtorPayment,
  getDebtorPayments,
  getDebtorPaymentPdf,
  sendDebtorPaymentEmail,
  deleteDebtorPayment,
  getDebtors,
  debtorCode,
  receiptCode,
} from '@/api/debtors';
import ConfirmModal from '@/components/ConfirmModal';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import { parseLocalDate } from '@/utils/availability';
import {
  bookingReferenceDisplay,
  bookingTotalAmount,
  bookingGuestLabel,
} from '@/utils/bookingDisplay';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { listFromSuccessEnvelope } from '@/utils/apiEnvelope';
import { fmtRand as fmtMoney } from '@/utils/formatMoney';

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

function roomLabel(b) {
  const r = b.room ?? b.roomId;
  if (r == null) return '—';
  if (typeof r === 'object' && r.name) return r.name;
  return String(r);
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
    debtorNumber: String(raw.debtorNumber || raw.debtor_number || '').trim(),
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
    note: booking ? `Guest payment — ${guest} (${ref})` : '',
    debtorId,
  };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'receipt.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function BookingPaymentsPage() {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEmail = ['admin', 'finance'].includes(String(user?.role || '').toLowerCase());
  const canDeletePayment = canEmail;
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentBooking, setPaymentBooking] = useState(null);
  const [form, setForm] = useState(() => defaultPaymentForm(null));
  const [saveError, setSaveError] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [lastReceipt, setLastReceipt] = useState(null);
  const [receiptBusyKey, setReceiptBusyKey] = useState('');
  const [receiptMsg, setReceiptMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['debtors', 'pending-bookings', LIMIT],
    queryFn: () => getPendingBookingDebtors({ page: 1, limit: LIMIT }),
  });

  const rawList = useMemo(() => listFromSuccessEnvelope(data), [data]);
  const eligible = useMemo(() => rawList.map(toPaymentRow).filter(Boolean), [rawList]);

  const list = useMemo(() => {
    let rows = eligible.filter((b) => (Number(b.balance) || 0) > 0);
    if (monthFilter) {
      rows = rows.filter((b) => {
        const d = String(b.checkIn || b.eventDate || '').slice(0, 7);
        return d === monthFilter;
      });
    }
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((b) => {
      const hay = [
        b.guestName,
        b.guestEmail,
        b.guestPhone,
        b.reference,
        b.debtorNumber,
        roomLabel(b),
        bookingReferenceDisplay(b),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [eligible, search, monthFilter]);

  const receiptsQuery = useQuery({
    queryKey: ['debtors', 'receipts-history'],
    queryFn: async () => {
      const debtorsRes = await getDebtors({ page: 1, limit: 200 });
      const debtors = listFromSuccessEnvelope(debtorsRes);
      const withPaid = debtors.filter((d) => (Number(d.amountPaid) || 0) > 0).slice(0, 50);
      const batches = await Promise.all(
        withPaid.map(async (d) => {
          const id = String(d._id ?? d.id ?? '');
          if (!id) return [];
          try {
            const payRes = await getDebtorPayments(id);
            const payments = listFromSuccessEnvelope(payRes);
            return payments.map((p) => ({
              ...p,
              debtorId: id,
              debtorNumber: d.debtorNumber || '',
              debtorName: d.name || '',
              contactEmail: d.contactEmail || '',
            }));
          } catch {
            return [];
          }
        })
      );
      return batches
        .flat()
        .sort((a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0));
    },
    enabled: activeTab === 'history',
  });

  const historyEligible = receiptsQuery.data || [];
  const historyList = useMemo(() => {
    let rows = historyEligible;
    if (monthFilter) {
      rows = rows.filter((p) => String(p.paidAt || p.createdAt || '').slice(0, 7) === monthFilter);
    }
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      const hay = [p.debtorName, p.contactEmail, p.receiptNumber, p.debtorNumber, p.reference, p.note, p.method]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [historyEligible, search, monthFilter]);

  const outstandingBookings = useMemo(() => {
    return eligible
      .map((b) => ({ booking: b, outstanding: Number(b.balance ?? 0) || 0 }))
      .filter((x) => x.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [eligible]);

  const bookingSelectOptions = useMemo(() => {
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

  const downloadReceipt = useCallback(async ({ debtorId, paymentId, receiptNumber }) => {
    if (!debtorId || !paymentId) return;
    const key = `pdf:${paymentId}`;
    setReceiptBusyKey(key);
    setReceiptMsg(null);
    try {
      const res = await getDebtorPaymentPdf(debtorId, paymentId);
      const blob = res?.data ?? res;
      if (!(blob instanceof Blob)) throw new Error('Receipt PDF was not returned as a file.');
      if (blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        let msg = 'Could not download receipt PDF.';
        try {
          msg = JSON.parse(text)?.message || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      triggerBlobDownload(blob, `${receiptNumber || paymentId}.pdf`);
    } catch (err) {
      setReceiptMsg({ type: 'error', text: err?.message || 'Could not download receipt PDF.' });
    } finally {
      setReceiptBusyKey('');
    }
  }, []);

  const emailReceipt = useCallback(async ({ debtorId, paymentId, to, receiptNumber }) => {
    if (!debtorId || !paymentId) return;
    const key = `email:${paymentId}`;
    setReceiptBusyKey(key);
    setReceiptMsg(null);
    try {
      await sendDebtorPaymentEmail(debtorId, paymentId, to ? { to } : {});
      setReceiptMsg({
        type: 'ok',
        text: `Receipt ${receiptNumber || ''} emailed${to ? ` to ${to}` : ''}.`.trim(),
      });
    } catch (err) {
      setReceiptMsg({ type: 'error', text: err?.message || 'Could not email receipt.' });
    } finally {
      setReceiptBusyKey('');
    }
  }, []);

  const createMutation = useMutation({
    mutationFn: async ({ debtorId, body }) => recordDebtorPayment(debtorId, body),
    onSuccess: (resp, vars) => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      const meta = resp?.meta || {};
      const relatedPayment = resp?.related?.payment || {};
      const paymentId = String(meta.paymentId || relatedPayment._id || '');
      const debtorId = String(vars?.debtorId || resp?.data?._id || resp?.data?.id || '');
      setLastReceipt({
        debtorId,
        paymentId,
        receiptNumber: receiptCode(meta) || receiptCode(relatedPayment) || '',
        debtorNumber: debtorCode(meta) || debtorCode(resp?.data) || '',
        guestEmail: vars?.booking?.guestEmail || paymentBooking?.guestEmail || '',
        guestName: vars?.booking?.guestName || paymentBooking?.guestName || '',
        amount: relatedPayment.amount ?? vars?.body?.amount,
      });
      setReceiptMsg(null);
      closePayment();
      setActiveTab('history');
    },
    onError: (err) => {
      setSaveError(err?.message || 'Could not record payment.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ debtorId, paymentId }) => deleteDebtorPayment(debtorId, paymentId),
    onSuccess: (_resp, vars) => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      setDeleteTarget(null);
      if (lastReceipt?.paymentId && String(lastReceipt.paymentId) === String(vars?.paymentId)) {
        setLastReceipt(null);
      }
      setReceiptMsg({ type: 'ok', text: 'Payment deleted. Debtor balance and ledger were updated.' });
    },
    onError: (err) => {
      setReceiptMsg({ type: 'error', text: err?.message || 'Could not delete payment.' });
      setDeleteTarget(null);
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
        ...(form.reference?.trim() ? { reference: form.reference.trim() } : {}),
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
          <div className="page-title">{location.pathname.includes('/payments') ? 'Payments' : 'Booking payments'}</div>
          <div className="page-subtitle">
            {activeTab === 'pending' ? (
              <>Record receipts against booking debtors. Confirmations hold rooms for 24 hours until paid.</>
            ) : (
              <>Payment receipts (RCP-…) — download PDF or email to the guest.</>
            )}
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAddPayment}>
          <i className="fas fa-plus" aria-hidden /> Record payment
        </button>
      </div>

      {lastReceipt?.paymentId ? (
        <div className="card" style={{ borderColor: 'rgba(26, 107, 90, 0.35)' }}>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: '1 1 220px' }}>
              <div style={{ fontWeight: 700 }}>
                Receipt {lastReceipt.receiptNumber || lastReceipt.paymentId} recorded
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {lastReceipt.debtorNumber ? `${lastReceipt.debtorNumber} · ` : ''}
                {lastReceipt.guestName || 'Guest'}
                {lastReceipt.amount != null ? ` · ${fmtMoney(lastReceipt.amount)}` : ''}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={receiptBusyKey === `pdf:${lastReceipt.paymentId}`}
              onClick={() => downloadReceipt(lastReceipt)}
            >
              {receiptBusyKey === `pdf:${lastReceipt.paymentId}` ? 'Downloading…' : 'Download PDF'}
            </button>
            {canEmail ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={receiptBusyKey === `email:${lastReceipt.paymentId}`}
                onClick={() =>
                  emailReceipt({
                    ...lastReceipt,
                    to: lastReceipt.guestEmail || undefined,
                  })
                }
              >
                {receiptBusyKey === `email:${lastReceipt.paymentId}` ? 'Sending…' : 'Email receipt'}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLastReceipt(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {receiptMsg ? (
        <div className={`card ${receiptMsg.type === 'error' ? 'card--error' : ''}`}>
          <div className="card-body" style={{ fontSize: 13 }}>{receiptMsg.text}</div>
        </div>
      ) : null}

      {((activeTab === 'pending' && error) || (activeTab === 'history' && receiptsQuery.error)) && (
        <div className="card card--error">
          <div className="card-body">
            {(activeTab === 'history' ? receiptsQuery.error : error)?.message}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 12 }}>
          <div className="filter-tabs" role="tablist" aria-label="Payments views">
            <div
              role="tab"
              tabIndex={0}
              className={`filter-tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('pending');
                }
              }}
            >
              Outstanding
            </div>
            <div
              role="tab"
              tabIndex={0}
              className={`filter-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('history');
                }
              }}
            >
              Payments made
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="booking-payments-toolbar">
            <DashboardListFilters
              embedded
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={
                activeTab === 'pending'
                  ? 'Guest, email, phone, booking ref, debtor code…'
                  : 'Guest, receipt (RCP-), debtor (DBT-), reference…'
              }
              month={monthFilter}
              onMonthChange={setMonthFilter}
            />
            <p className="booking-payments-hint">
              {activeTab === 'pending' ? (
                <>Showing {list.length} of {eligible.length} booking debtors with balances pending.</>
              ) : (
                <>Showing {historyList.length} receipt{historyList.length === 1 ? '' : 's'}.</>
              )}
            </p>
          </div>
        </div>
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            {activeTab === 'pending' ? (
              <table className="statement-table booking-payments-table">
                <thead>
                  <tr>
                    <th>Debtor</th>
                    <th>Reference</th>
                    <th>Guest</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Room</th>
                    <th className="statement-table-num">Amount owed</th>
                    <th className="statement-table-num">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={10}>Loading bookings…</td></tr> : null}
                  {!isLoading && list.length === 0 ? (
                    <tr><td colSpan={10}>No pending booking debtors found.</td></tr>
                  ) : null}
                  {!isLoading &&
                    list.map((b) => {
                      const id = b._id ?? b.id ?? b.debtorId;
                      return (
                        <tr key={id || JSON.stringify(b)}>
                          <td><strong>{b.debtorNumber || '—'}</strong></td>
                          <td className="booking-payments-ref">{bookingReferenceDisplay(b)}</td>
                          <td>
                            <div className="booking-payments-guest">
                              {String(b.guestName || '').trim() || bookingGuestLabel(b)}
                            </div>
                            {b.guestEmail ? <div className="booking-payments-email">{b.guestEmail}</div> : null}
                          </td>
                          <td>
                            <span className={'badge ' + statusBadgeClass(b.status)}>{statusStr(b.status) || '—'}</span>
                          </td>
                          <td>{bookingDateLabel(b.checkIn || b.eventDate)}</td>
                          <td>{bookingDateLabel(b.checkOut)}</td>
                          <td className="booking-payments-room">{roomLabel(b)}</td>
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
            ) : (
              <table className="statement-table booking-payments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Receipt</th>
                    <th>Debtor</th>
                    <th>Guest</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th className="statement-table-num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {receiptsQuery.isLoading ? <tr><td colSpan={8}>Loading receipts…</td></tr> : null}
                  {!receiptsQuery.isLoading && historyList.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        No receipts yet. Record a payment on the Outstanding tab to create an RCP-… receipt.
                      </td>
                    </tr>
                  ) : null}
                  {!receiptsQuery.isLoading &&
                    historyList.map((p) => {
                      const paymentId = String(p._id ?? p.id ?? '');
                      const rcp = receiptCode(p) || paymentId.slice(-8);
                      const dbt = debtorCode(p) || '—';
                      return (
                        <tr key={paymentId || JSON.stringify(p)}>
                          <td>{p.paidAt ? String(p.paidAt).slice(0, 10) : '—'}</td>
                          <td><strong>{rcp}</strong></td>
                          <td>{dbt}</td>
                          <td>
                            <div className="booking-payments-guest">{p.debtorName || '—'}</div>
                            {p.contactEmail ? <div className="booking-payments-email">{p.contactEmail}</div> : null}
                          </td>
                          <td>{p.method || '—'}</td>
                          <td className="booking-payments-ref">{p.reference || '—'}</td>
                          <td className="statement-table-num pl-pos">
                            <strong>{fmtMoney(p.amount)}</strong>
                          </td>
                          <td className="booking-payments-actions" style={{ whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={receiptBusyKey === `pdf:${paymentId}`}
                              onClick={() =>
                                downloadReceipt({
                                  debtorId: p.debtorId,
                                  paymentId,
                                  receiptNumber: rcp,
                                })
                              }
                            >
                              PDF
                            </button>
                            {canEmail ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ marginLeft: 6 }}
                                disabled={receiptBusyKey === `email:${paymentId}`}
                                onClick={() =>
                                  emailReceipt({
                                    debtorId: p.debtorId,
                                    paymentId,
                                    receiptNumber: rcp,
                                    to: p.contactEmail || undefined,
                                  })
                                }
                              >
                                Email
                              </button>
                            ) : null}
                            {canDeletePayment ? (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ marginLeft: 6, color: 'var(--danger, #b42318)', borderColor: 'rgba(180, 35, 24, 0.35)' }}
                                disabled={deleteMutation.isPending}
                                onClick={() =>
                                  setDeleteTarget({
                                    debtorId: p.debtorId,
                                    paymentId,
                                    receiptNumber: rcp,
                                    amount: p.amount,
                                    guestName: p.debtorName,
                                  })
                                }
                              >
                                Delete
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
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
                    const bid = b._id ?? b.id ?? b.debtorId;
                    const nm = String(b.guestName || '').trim() || bookingGuestLabel(b);
                    const code = b.debtorNumber ? `${b.debtorNumber} · ` : '';
                    return (
                      <option key={bid} value={String(b.debtorId || bid)}>
                        {code}{nm}
                        {bookingReferenceDisplay(b) !== '—' ? ` (${bookingReferenceDisplay(b)})` : ''}
                        {statusStr(b.status) ? ` — ${statusStr(b.status)}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              {outstandingBookings.length > 0 ? (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <div className="form-label">Unpaid / outstanding booking guests</div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 2 }}>
                    {outstandingBookings.map(({ booking: b, outstanding }) => {
                      const bid = String(b._id ?? b.id ?? b.debtorId ?? '');
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
                            <div>
                              {b.debtorNumber ? `${b.debtorNumber} · ` : ''}
                              {String(b.guestName || '').trim() || bookingGuestLabel(b)}
                            </div>
                            {b.guestEmail ? <div className="text-muted">{b.guestEmail}</div> : null}
                          </span>
                          <strong>{fmtMoney(outstanding)}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {paymentBooking ? (
                <div className="booking-payments-modal-summary">
                  <div>
                    <strong>
                      {paymentBooking.debtorNumber ? `${paymentBooking.debtorNumber} · ` : ''}
                      {String(paymentBooking.guestName || '').trim() || bookingGuestLabel(paymentBooking)}
                    </strong>
                  </div>
                  {paymentBooking.guestEmail ? (
                    <div className="booking-payments-email">{paymentBooking.guestEmail}</div>
                  ) : null}
                  <div className="booking-payments-modal-meta">
                    Ref {bookingReferenceDisplay(paymentBooking)} · Amount owed {fmtMoney(paymentBooking.amountOwed)} ·
                    Balance {fmtMoney(paymentBooking.balance)}
                  </div>
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  Pick which guest stay this receipt applies to.
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

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete payment"
        message={`Delete receipt ${deleteTarget?.receiptNumber || ''} for ${deleteTarget?.guestName || 'guest'} (${fmtMoney(deleteTarget?.amount)})? This reverses the ledger entry and restores the debtor balance.`}
        confirmLabel="Delete payment"
        onConfirm={() => {
          if (!deleteTarget?.debtorId || !deleteTarget?.paymentId) return;
          deleteMutation.mutate({
            debtorId: deleteTarget.debtorId,
            paymentId: deleteTarget.paymentId,
          });
        }}
        onCancel={() => setDeleteTarget(null)}
        busy={deleteMutation.isPending}
        tone="danger"
      />
    </div>
  );
}
