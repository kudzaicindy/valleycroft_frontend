import { Link, useSearchParams } from 'react-router-dom';
import './PayPage.css';

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref') || searchParams.get('m_payment_id') || '';

  return (
    <div className="booking-page-root">
      <header className="booking-header">
        <div className="booking-header-left">
          <img
            src="/Valley_Croft_Farm-removebg-preview.png"
            alt="ValleyCroft Farm"
            className="booking-header-logo"
          />
        </div>
        <div className="booking-header-right">
          <Link to="/" className="booking-header-back">← Back to Site</Link>
        </div>
      </header>

      <main className="pay-page-main">
        <div className="pay-page-inner">
          <div className="pay-result-card pay-result-card--success">
            <div className="pay-result-icon">
              <i className="fas fa-check-circle" />
            </div>
            <h1 className="pay-result-title">Payment successful!</h1>
            <p className="pay-result-desc">
              Thank you — your payment has been received and your booking is confirmed.
              You will receive a confirmation email shortly.
            </p>
            {ref && (
              <div className="pay-result-ref">
                Booking ref: <strong>{ref}</strong>
              </div>
            )}
            <div className="pay-result-actions">
              <Link
                to={`/booking-track${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`}
                className="pay-result-btn pay-result-btn--primary"
              >
                <i className="fas fa-calendar-check" /> View booking details
              </Link>
              <Link to="/" className="pay-result-btn pay-result-btn--outline">
                Back to home
              </Link>
            </div>
            <p className="pay-result-contact">
              Questions? Email us at{' '}
              <a href="mailto:valleycroftfarm@gmail.com">valleycroftfarm@gmail.com</a>
              {' '}or call <a href="tel:+27718024479">+27 718 024 479</a>
            </p>
          </div>
        </div>
      </main>

      <footer className="pay-page-footer">
        <span>© {new Date().getFullYear()} ValleyCroft Farm · Hekpoort, Gauteng, SA</span>
        <span><i className="fas fa-envelope" /> valleycroftfarm@gmail.com</span>
      </footer>
    </div>
  );
}
