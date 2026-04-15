import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { trackGuestBooking } from '@/api/guestBookings';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import { formatGuestBookingError } from '@/utils/guestBookingErrors';
import './BookingPage.css';

export default function BookingTrackPage() {
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get('ref') || '';
  const emailParam = searchParams.get('email') || '';
  const [ref, setRef] = useState(refParam);
  const [email, setEmail] = useState(emailParam);
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [errorModal, setErrorModal] = useState({ open: false, title: '', message: '' });

  useEffect(() => {
    if (!errorModal.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [errorModal.open]);

  async function handleTrack(e) {
    e.preventDefault();
    const trackingCode = ref.trim();
    const em = email.trim();
    const nextField = {};
    if (!trackingCode) nextField.ref = 'Tracking code is required.';
    if (!em) nextField.email = 'Email is required.';
    if (Object.keys(nextField).length) {
      setFieldErrors(nextField);
      return;
    }
    setFieldErrors({});
    setSearched(true);
    setErrorModal({ open: false, title: '', message: '' });
    setResult(null);
    setLoading(true);
    try {
      const data = await trackGuestBooking({ email: em, trackingCode });
      setResult(data);
    } catch (err) {
      setResult(null);
      setErrorModal({
        open: true,
        title: 'Could not load booking',
        message: formatGuestBookingError(err),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="booking-page">
      <header className="booking-header">
        <Link to="/" className="header-brand">
          <div className="header-icon">
            <i className="fas fa-leaf" />
          </div>
          <div>
            <div className="header-name">ValleyCroft</div>
            <div className="header-sub">Agro-Tourism</div>
          </div>
        </Link>
        <Link to="/" style={{ padding: '7px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,.3)', color: 'rgba(255,255,255,.75)', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>
          ← Back to Site
        </Link>
      </header>

      <div className="booking-body" style={{ gridTemplateColumns: '1fr', maxWidth: 560, margin: '28px auto', padding: '28px 40px' }}>
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <div className="step-badge"><i className="fas fa-search" style={{ fontSize: 12 }} /></div> Track Your Booking
            </div>
          </div>
          <div className="panel-body">
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
              Enter your tracking code and email address to view your reservation status.
            </p>
            <form onSubmit={handleTrack}>
              <div className="form-group">
                <div className="form-label">
                  Tracking code <span className="form-required">*</span>
                </div>
                <input
                  type="text"
                  className={`form-control${fieldErrors.ref ? ' form-control--error' : ''}`}
                  placeholder="e.g. VC-2026-089"
                  value={ref}
                  onChange={(e) => {
                    setRef(e.target.value);
                    if (fieldErrors.ref) setFieldErrors((f) => ({ ...f, ref: '' }));
                  }}
                  aria-invalid={!!fieldErrors.ref}
                />
                {fieldErrors.ref ? (
                  <div className="form-field-error" role="alert">
                    {fieldErrors.ref}
                  </div>
                ) : null}
              </div>
              <div className="form-group">
                <div className="form-label">
                  Your email <span className="form-required">*</span>
                </div>
                <input
                  type="email"
                  className={`form-control${fieldErrors.email ? ' form-control--error' : ''}`}
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: '' }));
                  }}
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email ? (
                  <div className="form-field-error" role="alert">
                    {fieldErrors.email}
                  </div>
                ) : null}
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? <><i className="fas fa-spinner fa-spin" /> Searching…</> : <><i className="fas fa-search" /> Track Booking</>}
              </button>
            </form>

            {searched && result && !loading && (
              <div className="review-block" style={{ marginTop: 24 }}>
                <div className="review-block-header">Booking found</div>
                <div className="review-row">
                  <div className="rv-label">Tracking code</div>
                  <div className="rv-val">{result.trackingCode || result.ref || '—'}</div>
                </div>
                <div className="review-row">
                  <div className="rv-label">Status</div>
                  <div className="rv-val">{result.status || '—'}</div>
                </div>
                <div className="review-row">
                  <div className="rv-label">Guest</div>
                  <div className="rv-val">{result.guestName || '—'}</div>
                </div>
                <div className="review-row">
                  <div className="rv-label">Check-in</div>
                  <div className="rv-val">{result.checkIn ? formatDateDayMonthYear(result.checkIn) : '—'}</div>
                </div>
                <div className="review-row">
                  <div className="rv-label">Check-out</div>
                  <div className="rv-val">{result.checkOut ? formatDateDayMonthYear(result.checkOut) : '—'}</div>
                </div>
                <div className="review-row">
                  <div className="rv-label">Total</div>
                  <div className="rv-val">{result.totalAmount != null ? 'R ' + Number(result.totalAmount).toLocaleString('en-ZA') : '—'}</div>
                </div>
              </div>
            )}

            {searched && !result && !loading && (
              <p style={{ marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
                No booking found for this tracking code and email. Please check your details or contact us at stay@valleycroft.com.
              </p>
            )}
          </div>
          <div className="panel-footer">
            <Link to="/booking" className="btn btn-outline btn-block">
              <i className="fas fa-calendar-check" /> Make a new booking
            </Link>
          </div>
        </div>
      </div>

      {errorModal.open ? (
        <div
          className="booking-modal-overlay"
          role="presentation"
          onClick={() => setErrorModal({ open: false, title: '', message: '' })}
        >
          <div
            className="booking-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="track-error-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="track-error-title" className="booking-modal-title">
              {errorModal.title}
            </h2>
            <div className="booking-modal-body">
              {errorModal.message.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary booking-modal-btn"
              onClick={() => setErrorModal({ open: false, title: '', message: '' })}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
