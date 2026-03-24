import { Link } from 'react-router-dom';

export default function AdminDashboard() {
  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Admin Dashboard</div>
          <div className="page-subtitle">Operations centre · Bookings, guests, inventory & user management</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/admin/staff" className="btn btn-outline"><i className="fas fa-user-plus" /> Add Staff</Link>
          <Link to="/admin/bookings" className="btn btn-primary"><i className="fas fa-plus" /> Add Booking</Link>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-card green"><div className="stat-icon"><i className="fas fa-clipboard-check" /></div><div className="stat-label">Pending Actions</div><div className="stat-value">7</div></div>
        <div className="stat-card gold"><div className="stat-icon"><i className="fas fa-calendar-day" /></div><div className="stat-label">Check-ins Today</div><div className="stat-value">3</div></div>
        <div className="stat-card sage"><div className="stat-icon"><i className="fas fa-sign-out-alt" /></div><div className="stat-label">Check-outs Today</div><div className="stat-value">2</div></div>
      </div>
      <div className="grid-cols-2-1">
        <div>
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="card-header"><div className="card-title">Quick Actions</div></div>
            <div className="card-body quick-actions-grid">
              <Link to="/admin/bookings" className="btn btn-outline quick-action-btn"><i className="fas fa-bed quick-action-icon qa-forest" /> New Booking</Link>
              <Link to="/admin/inventory" className="btn btn-outline quick-action-btn"><i className="fas fa-box quick-action-icon qa-sage" /> Update Stock</Link>
              <Link to="/admin/staff" className="btn btn-outline quick-action-btn"><i className="fas fa-users quick-action-icon qa-teal" /> Manage Staff</Link>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Today&apos;s Movements</div></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Guest</th><th>Room</th><th>Arrival</th><th></th></tr></thead>
                <tbody>
                  <tr><td><strong>Sipho Dlamini</strong></td><td>Rm 3 — Loft</td><td>10:00</td><td><button type="button" className="btn btn-primary btn-sm">Check In</button></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Pending <span className="nav-badge" style={{ position: 'static', marginLeft: 6 }}>7</span></div></div>
          <div className="card-body">
            <div className="activity-item"><div className="activity-icon" style={{ background: 'var(--red-light)', color: 'var(--red)' }}><i className="fas fa-exclamation" /></div><div><div className="activity-text"><strong>Thabo Molefe</strong> — payment outstanding</div></div></div>
            <div className="activity-item"><div className="activity-icon" style={{ background: 'rgba(184,137,42,0.12)', color: 'var(--gold)' }}><i className="fas fa-box" /></div><div><div className="activity-text"><strong>4 stock items</strong> need reordering</div></div></div>
          </div>
        </div>
      </div>
    </>
  );
}
