import { useEffect, useMemo, useState } from 'react';
import { FaChevronRight, FaSignOutAlt, FaTimes, FaUserCircle } from 'react-icons/fa';
import { useLocation, useNavigate } from 'react-router-dom';

function isPathActive(currentPath, targetPath) {
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export default function PortalSidebar({
  portalLabel,
  sections,
  onLogout,
  profileName,
  profileRole,
  onRequestCloseMobile,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const portalTitle = portalLabel?.toUpperCase?.() ?? 'PORTAL';

  const activeItem = useMemo(() => {
    for (const section of sections) {
      for (const item of section.items) {
        if (isPathActive(location.pathname, item.path)) return item;
      }
    }
    return null;
  }, [location.pathname, sections]);

  const [openSections, setOpenSections] = useState(() => {
    const state = {};
    sections.forEach((section) => {
      const hasActive = section.items.some((item) => isPathActive(location.pathname, item.path));
      state[section.id] = hasActive || section.defaultOpen !== false;
    });
    return state;
  });

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      let changed = false;
      sections.forEach((section) => {
        const hasActive = section.items.some((item) => isPathActive(location.pathname, item.path));
        if (hasActive && !next[section.id]) {
          next[section.id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [location.pathname, sections]);

  const handleLogout = () => {
    onRequestCloseMobile?.();
    if (onLogout) return onLogout();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <aside className="portal-sidebar">
      <header className="portal-sidebar__header">
        <div className="portal-sidebar__brand">
          <span className="portal-sidebar__logo">
            <span className="portal-sidebar__logo-text">VC</span>
          </span>
          <div className="portal-sidebar__brand-text">
            <p className="portal-sidebar__brand-name">ValleyCroft</p>
            <p className="portal-sidebar__brand-subtitle">{portalLabel}</p>
          </div>
        </div>
        {onRequestCloseMobile ? (
          <button
            type="button"
            className="portal-sidebar__close-mobile"
            onClick={onRequestCloseMobile}
            aria-label="Close menu"
          >
            <FaTimes />
          </button>
        ) : null}
      </header>

      <div className="portal-sidebar__body">
        <h1 className="portal-sidebar__title">{portalTitle}</h1>
        <nav className="portal-sidebar__nav" id="portal-sidebar-nav">
          {sections.map((section) => {
            const expanded = openSections[section.id];
            const isCollapsible = section.collapsible !== false;
            return (
              <section key={section.id} className="portal-sidebar__section">
                <button
                  type="button"
                  onClick={() => {
                    if (!isCollapsible) return;
                    setOpenSections((prev) => ({ ...prev, [section.id]: !prev[section.id] }));
                  }}
                  className="portal-sidebar__section-toggle"
                >
                  <span>{section.label}</span>
                  {isCollapsible ? (
                    <FaChevronRight className={`portal-sidebar__chevron ${expanded ? 'portal-sidebar__chevron--open' : ''}`} />
                  ) : null}
                </button>

                {expanded ? (
                  <div className="portal-sidebar__items">
                    {section.items.map((item) => {
                      const active = activeItem?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            navigate(item.path);
                            onRequestCloseMobile?.();
                          }}
                          className={[
                            'portal-sidebar__item',
                            active ? 'portal-sidebar__item--active' : '',
                          ].join(' ')}
                        >
                          <span className="portal-sidebar__item-icon">{item.icon}</span>
                          <span className="portal-sidebar__item-label">{item.label}</span>
                          {active ? <span className="portal-sidebar__item-indicator" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>
      </div>

      <footer className="portal-sidebar__footer">
        {profileName ? (
          <div className="portal-sidebar__profile">
            <div className="portal-sidebar__profile-row">
              <FaUserCircle className="portal-sidebar__profile-icon" />
              <p className="portal-sidebar__profile-name">{profileName}</p>
            </div>
            {profileRole ? <p className="portal-sidebar__profile-role">{profileRole}</p> : null}
          </div>
        ) : null}
        <button type="button" onClick={handleLogout} className="portal-sidebar__logout">
          <span className="portal-sidebar__logout-icon">
            <FaSignOutAlt />
          </span>
          <span>Logout</span>
        </button>
      </footer>
    </aside>
  );
}
