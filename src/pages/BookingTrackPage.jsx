import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { trackGuestBooking } from '@/api/guestBookings';
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
  const [error, setError] = useState(null);

  async function handleTrack(e) {
    e.preventDefault();
    const trackingCode = ref.trim();
    const em = email.trim();
    if (!trackingCode || !em) {
      alert('Please enter both your tracking code and email address.');
      return;
    }
    setSearched(true);
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await trackGuestBooking({ email: em, trackingCode });
      setResult(data);
    } catch (err) {
      setError(err && err.message ? err.message : 'Booking not found.');
      setResult(null);
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
            {error && <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
            <form onSubmit={handleTrack}>
              <div className="form-group">
                <div className="form-label">Tracking code</div>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. VC-2026-089"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
              </div>
              <div className="form-group">
                <div className="form-label">Your Email</div>
                <input
                  type="email"
                  className="form-control"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
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
                  <div className="rv-val">{result.checkIn ? new Date(result.checkIn).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                </div>
                <div className="review-row">
                  <div className="rv-label">Check-out</div>
                  <div className="rv-val">{result.checkOut ? new Date(result.checkOut).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
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
    </div>
  );
}
