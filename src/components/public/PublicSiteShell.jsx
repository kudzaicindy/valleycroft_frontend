import { createContext, useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FARM_BARN_INTERIOR_PHOTOS, FARM_SURROUNDINGS_PHOTOS } from '@/content/farmLifeMedia';

const FarmGalleryContext = createContext({ openFarmGallery: () => {} });

export function useFarmGallery() {
  return useContext(FarmGalleryContext);
}

function scrollToHash(hash) {
  if (!hash) return;
  if (hash.startsWith('#') && hash.length > 1) {
    const el = document.querySelector(hash);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
}

/**
 * @param {{ children: import('react').ReactNode, animateKey?: string | number }} props
 */
export default function PublicSiteShell({ children, animateKey = 0 }) {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [farmGalleryOpen, setFarmGalleryOpen] = useState(false);
  const isHome = location.pathname === '/';
  const showSolidNav = true;

  const closeNav = () => setNavOpen(false);

  const navTo = (path) => {
    closeNav();
    if (path.startsWith('/#')) {
      const hash = path.slice(path.indexOf('#'));
      if (location.pathname === '/') scrollToHash(hash);
      else window.location.href = path;
      return;
    }
    if (path.startsWith('#')) {
      scrollToHash(path);
    }
  };

  useEffect(() => {
    setNavScrolled(window.scrollY > 60);
    const onScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('landing-nav-open', navOpen);
    return () => document.body.classList.remove('landing-nav-open');
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!farmGalleryOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setFarmGalleryOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [farmGalleryOpen]);

  useEffect(() => {
    if (!farmGalleryOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [farmGalleryOpen]);

  return (
    <div className={`landing-page${isHome ? ' landing-page--home' : ''}`}>
      <nav
        className={['landing-nav', isHome ? 'landing-nav--home' : '', navOpen ? 'nav-is-open' : '', showSolidNav ? 'nav-scrolled' : ''].filter(Boolean).join(' ')}
        aria-label="Primary"
      >
        <Link to="/" className="nav-brand" onClick={closeNav}>
          <img src="/Valley_Croft_Farm-removebg-preview.png" alt="Valley Croft Farm" className="nav-logo-img" />
        </Link>
        <div className="nav-links">
          {isHome ? (
            <a href="#about" className="nav-link">Discover</a>
          ) : (
            <Link to="/#about" className="nav-link">Discover</Link>
          )}
          <Link to="/stays" className={`nav-link ${location.pathname === '/stays' ? 'nav-link--active' : ''}`}>Stays</Link>
          <Link to="/events" className={`nav-link ${location.pathname === '/events' ? 'nav-link--active' : ''}`}>Venues</Link>
          <a href="#contact" className="nav-link">Contact</a>
        </div>
        <div className="nav-actions">
          <Link to="/event-enquiry" className="btn-nav btn-outline-nav" onClick={closeNav}>
            Enquire
          </Link>
          <Link to="/booking" className="btn-nav btn-gold-nav" onClick={closeNav}>
            Book your stay
          </Link>
        </div>
        <button
          type="button"
          className="nav-menu-toggle"
          aria-expanded={navOpen}
          aria-controls="landing-nav-drawer"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setNavOpen((o) => !o)}
        >
          <i className={navOpen ? 'fas fa-times' : 'fas fa-bars'} aria-hidden />
        </button>
      </nav>

      <div className={`nav-drawer-backdrop ${navOpen ? 'open' : ''}`} onClick={closeNav} role="presentation" />
      <div
        id="landing-nav-drawer"
        className={`nav-drawer ${navOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
      >
        {isHome ? (
          <a href="#about" className="nav-drawer-link" onClick={() => navTo('#about')}>Discover</a>
        ) : (
          <Link to="/#about" className="nav-drawer-link" onClick={closeNav}>Discover</Link>
        )}
        <Link to="/stays" className="nav-drawer-link" onClick={closeNav}>Stays</Link>
        <Link to="/events" className="nav-drawer-link" onClick={closeNav}>Venues</Link>
        <a href="#contact" className="nav-drawer-link" onClick={() => navTo('#contact')}>Contact</a>
        <div className="nav-drawer-actions">
          <Link to="/event-enquiry" className="btn-nav btn-outline-nav nav-drawer-btn" onClick={closeNav}>
            Enquire
          </Link>
          <Link to="/booking" className="btn-nav btn-gold-nav nav-drawer-btn" onClick={closeNav}>
            Book your stay
          </Link>
        </div>
      </div>

      <FarmGalleryContext.Provider value={{ openFarmGallery: () => setFarmGalleryOpen(true) }}>
        {children}
      </FarmGalleryContext.Provider>

      <div
        className={`modal-backdrop farm-gallery-modal-backdrop ${farmGalleryOpen ? 'open' : ''}`}
        onClick={() => setFarmGalleryOpen(false)}
        role="presentation"
      >
        <div
          className="farm-gallery-modal-box"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="farm-gallery-modal-title"
        >
          <button type="button" className="modal-close" onClick={() => setFarmGalleryOpen(false)} aria-label="Close gallery">
            <i className="fas fa-times" />
          </button>
          <h3 id="farm-gallery-modal-title" className="farm-gallery-modal-title">
            Valley Croft photo gallery
          </h3>
          <p className="farm-gallery-modal-lead">
            Outdoors includes the entrance walkway, pool, lawns, and patios. Barn photos show the interior event space.
          </p>
          <div className="farm-gallery-modal-scroll">
            <h4 className="farm-gallery-modal-subhead">Grounds &amp; outdoors</h4>
            <div className="farm-gallery-modal-grid">
              {FARM_SURROUNDINGS_PHOTOS.map((src, i) => (
                <div
                  key={src}
                  className="farm-gallery-modal-cell"
                  style={{ backgroundImage: `url("${src}")` }}
                  role="img"
                  aria-label={`Outdoors, photo ${i + 1}`}
                />
              ))}
            </div>
            <h4 className="farm-gallery-modal-subhead farm-gallery-modal-subhead--barn">Barn interior</h4>
            <div className="farm-gallery-modal-grid">
              {FARM_BARN_INTERIOR_PHOTOS.map((src, i) => (
                <div
                  key={src}
                  className="farm-gallery-modal-cell"
                  style={{ backgroundImage: `url("${src}")` }}
                  role="img"
                  aria-label={`Barn interior, photo ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer id="contact">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand-col">
              <img src="/Valley_Croft_Farm-removebg-preview.png" alt="ValleyCroft" className="footer-logo-img" />
              <p className="footer-brand-desc">
                A working farm in Hekpoort where mornings slow down, evenings gather around the fire,
                and every guest is welcomed like family.
              </p>
              <div className="footer-socials">
                <a href="https://www.facebook.com/valleycroftfarm" target="_blank" rel="noopener noreferrer" className="social-btn" aria-label="Facebook"><i className="fa-brands fa-facebook-f" /></a>
                <a href="https://www.instagram.com/valleycroftfarm" target="_blank" rel="noopener noreferrer" className="social-btn" aria-label="Instagram"><i className="fa-brands fa-instagram" /></a>
                <a href="https://wa.me/27718024479" target="_blank" rel="noopener noreferrer" className="social-btn" aria-label="WhatsApp"><i className="fa-brands fa-whatsapp" /></a>
              </div>
            </div>
            <div>
              <div className="footer-col-title">Explore</div>
              <Link to="/" className="footer-link">Farm life</Link>
              <Link to="/stays" className="footer-link">Farm stays</Link>
              <Link to="/events" className="footer-link">Events &amp; venues</Link>
              <Link to="/booking" className="footer-link">Book a stay</Link>
            </div>
            <div>
              <div className="footer-col-title">Plan</div>
              <Link to="/event-enquiry?type=wedding" className="footer-link">Weddings</Link>
              <Link to="/event-enquiry?type=celebration" className="footer-link">Celebrations</Link>
              <Link to="/event-enquiry?type=corporate" className="footer-link">Business meetings</Link>
              <Link to="/event-enquiry?type=retreat" className="footer-link">Retreats</Link>
              <Link to="/booking-track" className="footer-link">Track reservation</Link>
            </div>
            <div>
              <div className="footer-col-title">Contact</div>
              <a href="tel:+27718024479" className="footer-contact-row">
                <span className="footer-contact-icon"><i className="fas fa-phone" /></span>
                <span>+27 718 024 479</span>
              </a>
              <a href="mailto:valleycroftfarm@gmail.com" className="footer-contact-row">
                <span className="footer-contact-icon"><i className="fas fa-envelope" /></span>
                <span>valleycroftfarm@gmail.com</span>
              </a>
              <div className="footer-contact-row">
                <span className="footer-contact-icon"><i className="fas fa-map-marker-alt" /></span>
                <span>Hekpoort, Gauteng, SA</span>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copy">© 2026 Valley Croft Farm. All rights reserved.</div>
          </div>
        </div>
      </footer>

      <nav className="landing-m-bottom-nav" aria-label="Mobile quick links">
        {isHome ? (
          <a href="#about" className="landing-m-bottom-item">
            <i className="fas fa-compass" aria-hidden />
            <span>Discover</span>
          </a>
        ) : (
          <Link to="/#about" className="landing-m-bottom-item">
            <i className="fas fa-compass" aria-hidden />
            <span>Discover</span>
          </Link>
        )}
        <Link to="/stays" className={`landing-m-bottom-item ${location.pathname === '/stays' ? 'landing-m-bottom-item--active' : ''}`}>
          <i className="fas fa-bed" aria-hidden />
          <span>Stays</span>
        </Link>
        <Link to="/events" className={`landing-m-bottom-item ${location.pathname === '/events' ? 'landing-m-bottom-item--active' : ''}`}>
          <i className="fas fa-glass-cheers" aria-hidden />
          <span>Venues</span>
        </Link>
        <a href="#contact" className="landing-m-bottom-item">
          <i className="fas fa-envelope" aria-hidden />
          <span>Contact</span>
        </a>
      </nav>
    </div>
  );
}
