import { cloneElement, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaBars, FaTimes } from 'react-icons/fa';

/**
 * Wraps portal sidebar + main content. On narrow viewports opens the sidebar as an overlay drawer.
 * @param {{ mobileTitle: string, sidebar: import('react').ReactElement, children: import('react').ReactNode }} props
 */
export default function DashboardLayoutShell({ mobileTitle, sidebar, children }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  const sidebarEl = cloneElement(sidebar, {
    onRequestCloseMobile: () => setNavOpen(false),
  });

  return (
    <div className={`dashboard${navOpen ? ' dashboard--nav-open' : ''}`}>
      <header className="dashboard__mobile-topbar">
        <button
          type="button"
          className="dashboard__menu-toggle"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-controls="portal-sidebar-nav"
          aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {navOpen ? <FaTimes /> : <FaBars />}
        </button>
        <span className="dashboard__mobile-title">{mobileTitle}</span>
      </header>
      <div
        className="dashboard__nav-backdrop"
        onClick={() => setNavOpen(false)}
        role="presentation"
        aria-hidden={!navOpen}
      />
      {sidebarEl}
      <div className="main-wrapper">
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
