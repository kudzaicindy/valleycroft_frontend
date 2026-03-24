import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { dashboardNavConfig } from '@/config/dashboardNav';
import '@/styles/Dashboard.css';

export default function DashboardLayout({ role, basePath, children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState(() => {
    const config = dashboardNavConfig[role] || dashboardNavConfig.admin;
    return new Set(config.sections.map((s) => s.label));
  });
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const config = dashboardNavConfig[role] || dashboardNavConfig.admin;
  useEffect(() => {
    const cfg = dashboardNavConfig[role] || dashboardNavConfig.admin;
    setOpenSections(new Set(cfg.sections.map((s) => s.label)));
  }, [role]);

  const toggleSection = (label) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const isActive = (itemPath) => {
    const normalized = (itemPath || '').toString();
    const atBase = location.pathname === basePath || location.pathname === `${basePath}/`;
    if (normalized === '' || normalized === 'dashboard') return atBase || location.pathname.startsWith(`${basePath}/dashboard`);
    return location.pathname.startsWith(`${basePath}/${normalized}`);
  };

  return (
    <div className={`dashboard ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link to={`${basePath}/dashboard`} style={{ textDecoration: 'none' }}>
            <div className="logo-line">
              <div className="logo-icon">
                <i className="fas fa-leaf" />
              </div>
              <div>
                <div className="brand-name">ValleyCroft</div>
                <div className="brand-sub">Farm Management</div>
              </div>
            </div>
          </Link>
        </div>
        <div className="sidebar-user">
          <div className="user-avatar">{config.initials}</div>
          <div className="user-info">
            <div className="user-name">{config.name}</div>
            <div className="user-role">{config.role}</div>
          </div>
          <div className="role-badge">{config.badge}</div>
        </div>
        <nav>
          {config.sections.map((section) => {
            const isOpen = openSections.has(section.label);
            return (
              <div
                key={section.label}
                className={`nav-section ${isOpen ? 'nav-section-open' : 'nav-section-closed'}`}
              >
                <button
                  type="button"
                  className="nav-section-header"
                  onClick={() => toggleSection(section.label)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${section.label}` : `Expand ${section.label}`}
                >
                  <span className="nav-section-label">{section.label}</span>
                  <i className={`fas fa-chevron-${isOpen ? 'down' : 'right'} nav-section-chevron`} />
                </button>
                {(isOpen || sidebarCollapsed) && (
                  <div className="nav-section-items">
                    {section.items.map((item) => {
                      const to = item.path ? `${basePath}/${item.path}` : `${basePath}/dashboard`;
                      const active = isActive(item.path);
                      return (
                        <Link
                          key={item.path + item.label}
                          to={to}
                          className={`nav-item ${active ? 'active' : ''}`}
                        >
                          <div className="nav-icon">
                            <i className={item.icon} />
                          </div>
                          <span className="nav-label">{item.label}</span>
                          {item.badge != null && (
                            <span className="nav-badge">{item.badge}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="nav-item" onClick={() => {}} title="Settings">
            <div className="nav-icon"><i className="fas fa-cog" /></div>
            <span className="nav-label">Settings</span>
          </button>
          <button type="button" className="nav-item" onClick={handleLogout} title="Sign Out">
            <div className="nav-icon"><i className="fas fa-sign-out-alt" /></div>
            <span className="nav-label">Sign Out</span>
          </button>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <i className={`fas fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`} />
          </button>
        </div>
      </aside>
      <div className="main-wrapper">
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
