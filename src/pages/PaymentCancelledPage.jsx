import { Link, useSearchParams } from 'react-router-dom';
import './PayPage.css';

export default function PaymentCancelledPage() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref') || '';
  const email = searchParams.get('email') || '';

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
          <div className="pay-result-card pay-result-card--cancelled">
            <div className="pay-result-icon">
              <i className="fas fa-times-circle" />
            </div>
            <h1 className="pay-result-title">Payment cancelled</h1>
            <p className="pay-result-desc">
              Your payment was not completed. No charge has been made to your account.
              Your booking is still on hold — you can try paying again.
            </p>
            {ref && (
              <div className="pay-result-ref">
                Booking ref: <strong>{ref}</strong>
              </div>
            )}
            <div className="pay-result-actions">
              {ref && email ? (
                <Link
                  to={`/pay?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`}
                  className="pay-result-btn pay-result-btn--primary"
                >
                  <i className="fas fa-redo" /> Try again
                </Link>
              ) : (
                <Link to="/booking-track" className="pay-result-btn pay-result-btn--primary">
                  <i className="fas fa-search" /> Find my booking
                </Link>
              )}
              <Link to="/" className="pay-result-btn pay-result-btn--outline">
                Back to home
              </Link>
            </div>
            <p className="pay-result-contact">
              Need help? Contact us at{' '}
              <a href="mailto:valleycroftfarm@gmail.com">valleycroftfarm@gmail.com</a>
              {' '}or <a href="tel:+27718024479">+27 718 024 479</a>
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
