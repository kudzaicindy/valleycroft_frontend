import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPaymentOptions, startPayfastCheckout, trackGuestBooking } from '@/api/guestBookings';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import './BookingPage.css';
import './PayPage.css';

function fmt(n) {
  return n == null ? '—' : `R ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

const PAYMENT_TYPES = [
  { id: 'deposit', label: 'Deposit', desc: 'Pay the deposit to secure your booking' },
  { id: 'balance', label: 'Remaining balance', desc: 'Pay the outstanding balance' },
  { id: 'full', label: 'Full amount', desc: 'Pay the total booking amount upfront' },
];

export default function PayPage() {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const refParam = searchParams.get('ref') || '';

  const [options, setOptions] = useState(null);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentType, setPaymentType] = useState('full');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const pfFormRef = useRef(null);

  useEffect(() => {
    if (!emailParam || !refParam) return;
    setLoading(true);
    setError('');

    Promise.all([
      getPaymentOptions(emailParam, refParam),
      trackGuestBooking({ email: emailParam, trackingCode: refParam }),
    ])
      .then(([optRes, trackRes]) => {
        const d = optRes?.data ?? optRes;
        setOptions(d);
        // Default to best available option
        if (d?.balanceDue > 0 && d?.depositDue > 0) setPaymentType('deposit');
        else if (d?.balanceDue > 0) setPaymentType('balance');
        else setPaymentType('full');

        // Extract booking detail from track response
        const t = trackRes?.data ?? trackRes;
        setBookingDetail(t?.data ?? t);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || 'Could not load booking details. Please check your email and tracking code.');
      })
      .finally(() => setLoading(false));
  }, [emailParam, refParam]);

  async function handlePay() {
    setPaying(true);
    setPayError('');
    try {
      const res = await startPayfastCheckout({
        email: emailParam,
        trackingCode: refParam,
        paymentType,
      });
      const pf = res?.data?.payfast ?? res?.payfast;
      if (!pf?.action || !pf?.fields) throw new Error('Invalid checkout response from server.');

      // Build and auto-submit a hidden PayFast form
      const form = pfFormRef.current;
      form.action = pf.action;
      form.method = 'POST';
      // Clear previous fields
      form.innerHTML = '';
      Object.entries(pf.fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      form.submit();
    } catch (err) {
      setPayError(err?.response?.data?.message || err?.message || 'Payment could not be started. Please try again.');
      setPaying(false);
    }
  }

  const booking = bookingDetail ?? options?.booking;
  const availableTypes = PAYMENT_TYPES.filter((t) => {
    if (t.id === 'deposit') return options?.depositDue > 0;
    if (t.id === 'balance') return options?.balanceDue > 0;
    if (t.id === 'full') return options?.totalAmount > 0;
    return false;
  });
  const selectedAmount =
    paymentType === 'deposit' ? options?.depositDue :
    paymentType === 'balance' ? options?.balanceDue :
    options?.totalAmount;

  const alreadyPaid = options && options.balanceDue === 0 && options.depositDue === 0;

  return (
    <div className="booking-page-root">
      {/* Hidden PayFast POST form */}
      <form ref={pfFormRef} style={{ display: 'none' }} />

      {/* Header */}
      <header className="booking-header">
        <div className="booking-header-left">
          <img
            src="/Valley_Croft_Farm-removebg-preview.png"
            alt="ValleyCroft Farm"
            className="booking-header-logo"
          />
        </div>
        <div className="booking-header-right">
          <div className="booking-header-trust">
            <i className="fas fa-lock" style={{ color: 'var(--gold-l)' }} /> Secure Payment
          </div>
          <div className="booking-header-phone">
            <i className="fas fa-phone" style={{ color: 'var(--gold-l)' }} /> +27 718 024 479
          </div>
          <Link to="/" className="booking-header-back">← Back to Site</Link>
        </div>
      </header>

      <main className="pay-page-main">
        <div className="pay-page-inner">

          {/* Title */}
          <div className="pay-page-title-row">
            <div>
              <h1 className="pay-page-title">Complete your payment</h1>
              <p className="pay-page-subtitle">
                Booking ref: <strong>{refParam || '—'}</strong>
              </p>
            </div>
            <div className="pay-page-secure-badge">
              <i className="fas fa-shield-alt" /> Secured by PayFast
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="pay-page-state">
              <div className="pay-page-spinner" />
              <p>Loading booking details…</p>
            </div>
          )}

          {/* Error fetching options */}
          {!loading && error && (
            <div className="pay-page-error-box">
              <i className="fas fa-exclamation-circle" />
              <div>
                <strong>Could not load booking</strong>
                <p>{error}</p>
                <Link to="/booking-track" className="pay-page-link">Track your booking instead</Link>
              </div>
            </div>
          )}

          {/* No params */}
          {!emailParam && !refParam && !loading && (
            <div className="pay-page-error-box">
              <i className="fas fa-info-circle" />
              <div>
                <strong>Missing booking details</strong>
                <p>This page should be accessed via the Pay Now link in your confirmation email.</p>
                <Link to="/booking-track" className="pay-page-link">Track your booking</Link>
              </div>
            </div>
          )}

          {/* Already paid */}
          {!loading && !error && alreadyPaid && (
            <div className="pay-page-paid-box">
              <i className="fas fa-check-circle" />
              <div>
                <strong>Booking fully paid</strong>
                <p>Your booking is confirmed and fully paid. See you at the farm!</p>
                <Link to="/booking-track" className="pay-page-link">View booking details</Link>
              </div>
            </div>
          )}

          {/* Main content */}
          {!loading && !error && options && !alreadyPaid && (
            <div className="pay-page-content">

              {/* Booking summary card */}
              <div className="pay-summary-card">
                <div className="pay-summary-header">
                  <i className="fas fa-calendar-check" /> Booking Summary
                </div>
                <div className="pay-summary-body">
                  <div className="pay-summary-row">
                    <span>Guest</span>
                    <strong>{booking?.guestName || '—'}</strong>
                  </div>
                  <div className="pay-summary-row">
                    <span>Email</span>
                    <span>{booking?.guestEmail || emailParam || '—'}</span>
                  </div>
                  <div className="pay-summary-row">
                    <span>Room</span>
                    <strong>{booking?.roomName || booking?.roomId?.name || '—'}</strong>
                  </div>
                  <div className="pay-summary-row">
                    <span>Check-in</span>
                    <span>{booking?.checkIn ? formatDateDayMonthYear(new Date(booking.checkIn)) : '—'}</span>
                  </div>
                  <div className="pay-summary-row">
                    <span>Check-out</span>
                    <span>{booking?.checkOut ? formatDateDayMonthYear(new Date(booking.checkOut)) : '—'}</span>
                  </div>
                  {booking?.checkIn && booking?.checkOut && (() => {
                    const nights = Math.round(
                      (new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24)
                    );
                    return nights > 0 ? (
                      <div className="pay-summary-row">
                        <span>Duration</span>
                        <span>{nights} night{nights !== 1 ? 's' : ''}</span>
                      </div>
                    ) : null;
                  })()}
                  <div className="pay-summary-row">
                    <span>Status</span>
                    <span className={`pay-summary-status pay-summary-status--${booking?.status || 'unknown'}`}>
                      {booking?.status ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1) : '—'}
                    </span>
                  </div>
                  <div className="pay-summary-divider" />
                  <div className="pay-summary-row">
                    <span>Total booking value</span>
                    <span>{fmt(options.totalAmount)}</span>
                  </div>
                  <div className="pay-summary-row">
                    <span>Amount paid so far</span>
                    <span className="pay-summary-paid">{fmt(options.amountPaid)}</span>
                  </div>
                  {options.depositDue > 0 && (
                    <div className="pay-summary-row">
                      <span>Deposit due</span>
                      <span className="pay-summary-due">{fmt(options.depositDue)}</span>
                    </div>
                  )}
                  <div className="pay-summary-row pay-summary-row--total">
                    <span>Remaining balance</span>
                    <span>{fmt(options.balanceDue)}</span>
                  </div>
                </div>
              </div>

              {/* Payment type selector */}
              {availableTypes.length > 1 && (
                <div className="pay-type-section">
                  <p className="pay-type-label">What would you like to pay?</p>
                  <div className="pay-type-grid">
                    {availableTypes.map((t) => {
                      const amount =
                        t.id === 'deposit' ? options.depositDue :
                        t.id === 'balance' ? options.balanceDue :
                        options.totalAmount;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`pay-type-card${paymentType === t.id ? ' pay-type-card--active' : ''}`}
                          onClick={() => setPaymentType(t.id)}
                        >
                          <span className="pay-type-name">{t.label}</span>
                          <span className="pay-type-amount">{fmt(amount)}</span>
                          <span className="pay-type-desc">{t.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pay button */}
              <div className="pay-cta-section">
                {payError && (
                  <div className="pay-error-inline">
                    <i className="fas fa-exclamation-triangle" /> {payError}
                  </div>
                )}
                <button
                  type="button"
                  className="pay-btn"
                  onClick={handlePay}
                  disabled={paying}
                >
                  {paying ? (
                    <><div className="pay-btn-spinner" /> Redirecting to PayFast…</>
                  ) : (
                    <><i className="fas fa-lock" /> Pay {fmt(selectedAmount)} securely</>
                  )}
                </button>
                <p className="pay-cta-note">
                  You will be redirected to PayFast's secure payment gateway. Your card details are never stored on our servers.
                </p>
              </div>

            </div>
          )}

        </div>
      </main>

      <footer className="pay-page-footer">
        <span>© {new Date().getFullYear()} ValleyCroft Farm · Hekpoort, Gauteng, SA</span>
        <span>
          <i className="fas fa-envelope" /> valleycroftfarm@gmail.com
        </span>
      </footer>
    </div>
  );
}
