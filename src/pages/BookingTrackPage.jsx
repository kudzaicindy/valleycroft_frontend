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
      setResult(data.data ?? data);
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
          <img
            src="/Valley_Croft_Farm-removebg-preview.png"
            alt="ValleyCroft Farm"
            className="booking-header-logo"
          />
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
              <div style={{ marginTop: 24, borderRadius: 14, overflow: 'hidden', border: '1px solid #dde8da', background: '#fff' }}>
                {/* Header banner */}
                <div style={{ background: 'linear-gradient(135deg, #162b1a 0%, #1e3d24 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 700, color: '#f0ede4', marginBottom: 2 }}>Booking Found</div>
                    <div style={{ fontSize: 11, color: 'rgba(240,237,228,0.6)', fontWeight: 500 }}>ValleyCroft Farm reservation</div>
                  </div>
                  {result.status && (
                    <span style={{
                      display: 'inline-block', padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.04em',
                      background: result.status === 'confirmed' ? 'rgba(56,142,90,0.22)' : result.status === 'cancelled' ? 'rgba(185,50,37,0.2)' : 'rgba(184,137,62,0.22)',
                      color: result.status === 'confirmed' ? '#a8f0c0' : result.status === 'cancelled' ? '#f0a8a0' : '#f0d8a0',
                      border: `1px solid ${result.status === 'confirmed' ? 'rgba(56,142,90,0.4)' : result.status === 'cancelled' ? 'rgba(185,50,37,0.4)' : 'rgba(184,137,62,0.4)'}`,
                    }}>{result.status}</span>
                  )}
                </div>

                {/* Fields */}
                <div style={{ padding: '6px 0' }}>
                  {[
                    { label: 'Tracking code', value: result.trackingCode || result.ref, mono: true },
                    { label: 'Guest name',    value: result.guestName },
                    { label: 'Email',         value: result.guestEmail },
                    { label: 'Room',          value: result.roomName || result.roomId?.name },
                    { label: 'Check-in',      value: result.checkIn ? formatDateDayMonthYear(result.checkIn) : null },
                    { label: 'Check-out',     value: result.checkOut ? formatDateDayMonthYear(result.checkOut) : null },
                    { label: 'Total',         value: result.totalAmount != null ? 'R ' + Number(result.totalAmount).toLocaleString('en-ZA') : null, bold: true },
                    { label: 'Deposit paid',  value: result.deposit != null ? 'R ' + Number(result.deposit).toLocaleString('en-ZA') : null },
                  ].map(({ label, value, mono, bold }) => value ? (
                    <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 20px', borderBottom: '1px solid #f0ede6' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#7a8e80', minWidth: 110, letterSpacing: '0.02em', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: bold ? '#1a3820' : '#2d3f2f', fontFamily: mono ? 'monospace' : 'inherit', letterSpacing: mono ? '0.06em' : 'inherit' }}>{value}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            {searched && !result && !loading && (
              <p style={{ marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
                No booking found for this tracking code and email. Please check your details or contact us at valleycroftfarm@gmail.com.
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
