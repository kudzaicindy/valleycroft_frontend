import { Link } from 'react-router-dom';

export default function CeoDashboard() {
  return (
    <>
      <div className="hero-banner">
        <div className="hero-text">
          <div className="hero-greeting">Good Morning, Catherine</div>
          <div className="hero-title">Welcome back to ValleyCroft</div>
          <div className="hero-subtitle">
            Everything is running smoothly. 3 check-ins expected today.
          </div>
          <div className="hero-actions">
            <Link to="/ceo/bookings" className="btn btn-gold btn-sm">
              <i className="fas fa-plus" /> New Booking
            </Link>
            <Link to="/ceo/reports" className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
              <i className="fas fa-chart-bar" /> View Reports
            </Link>
          </div>
        </div>
        <div className="hero-stats-row">
          <div className="hero-stat">
            <div className="hero-stat-value">87%</div>
            <div className="hero-stat-label">Occupancy</div>
          </div>
          <div className="hero-divider" />
          <div className="hero-stat">
            <div className="hero-stat-value">14</div>
            <div className="hero-stat-label">Guests In-House</div>
          </div>
          <div className="hero-divider" />
          <div className="hero-stat">
            <div className="hero-stat-value">R 48k</div>
            <div className="hero-stat-label">This Month</div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card green">
          <div className="stat-icon"><i className="fas fa-bed" /></div>
          <div className="stat-label">Active Bookings</div>
          <div className="stat-value">18<span className="stat-unit"> rooms</span></div>
          <div className="stat-trend up"><i className="fas fa-arrow-up" /> +3 from last week</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon"><i className="fas fa-rand-sign" /></div>
          <div className="stat-label">Monthly Revenue</div>
          <div className="stat-value">R 48<span className="stat-unit">,250</span></div>
          <div className="stat-trend up"><i className="fas fa-arrow-up" /> +12% vs last month</div>
        </div>
        <div className="stat-card sage">
          <div className="stat-icon"><i className="fas fa-users" /></div>
          <div className="stat-label">Staff On Duty</div>
          <div className="stat-value">9<span className="stat-unit"> / 12</span></div>
          <div className="stat-trend up"><i className="fas fa-check-circle" /> 3 off today</div>
        </div>
        <div className="stat-card teal">
          <div className="stat-icon"><i className="fas fa-boxes" /></div>
          <div className="stat-label">Stock Alerts</div>
          <div className="stat-value">4<span className="stat-unit"> items</span></div>
          <div className="stat-trend down"><i className="fas fa-exclamation-triangle" /> Reorder needed</div>
        </div>
      </div>

      <div className="grid-cols-3-1">
        <div>
          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div><div className="card-title">Revenue Trend <span>Monthly</span></div></div>
                <div className="filter-tabs">
                  <div className="filter-tab active">6M</div>
                  <div className="filter-tab">12M</div>
                </div>
              </div>
              <div className="card-body">
                <div className="bar-chart">
                  {['55%', '68%', '80%', '62%', '74%', '88%'].map((h, i) => (
                    <div key={i} className="bar-wrap">
                      <div className={`bar-col ${i === 2 || i === 5 ? 'gold' : 'forest'}`} style={{ height: h }} />
                      <div className="bar-label">{['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'][i]}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg: R 41,200/mo</span>
                  <span style={{ fontSize: 11, color: '#3a8c4e', fontWeight: 700 }}>↑ 7.2% YoY</span>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Room Occupancy</div>
                <span className="badge badge-confirmed">87% Full</span>
              </div>
              <div className="card-body">
                <div className="kpi-ring-wrap">
                  <svg className="donut-svg" width={90} height={90} viewBox="0 0 90 90">
                    <circle cx={45} cy={45} r={36} fill="none" stroke="var(--linen)" strokeWidth={10} />
                    <circle cx={45} cy={45} r={36} fill="none" stroke="var(--forest)" strokeWidth={10} strokeDasharray="196 226" strokeDashoffset={56} strokeLinecap="round" />
                    <text x={45} y={50} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--forest-dark)" fontFamily="Cormorant Garamond, serif">87%</text>
                  </svg>
                  <div className="kpi-ring-info">
                    <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Occupied</div><div style={{ fontWeight: 700, color: 'var(--forest)' }}>13 rooms</div></div>
                    <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vacant</div><div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>2 rooms</div></div>
                    <div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Maintenance</div><div style={{ fontWeight: 700, color: 'var(--gold)' }}>0 rooms</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 0 }}>
            <div className="card-header">
              <div className="card-title">Today&apos;s Bookings <span>14 Mar 2026</span></div>
              <Link to="/ceo/bookings" className="btn btn-primary btn-sm"><i className="fas fa-external-link-alt" /> All Bookings</Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr><th>Guest</th><th>Room</th><th>Check-in</th><th>Check-out</th><th>Guests</th><th>Status</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  <tr><td><strong>Sipho Dlamini</strong><br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 82 456 7890</span></td><td>Rm 3 — Loft</td><td>Today</td><td>16 Mar</td><td>2</td><td><span className="badge badge-checkin">Check-in</span></td><td style={{ fontWeight: 700, color: 'var(--forest)' }}>R 2,400</td></tr>
                  <tr><td><strong>Amara Osei</strong><br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 71 234 5678</span></td><td>Rm 7 — Garden</td><td>Today</td><td>15 Mar</td><td>1</td><td><span className="badge badge-checkin">Check-in</span></td><td style={{ fontWeight: 700, color: 'var(--forest)' }}>R 1,200</td></tr>
                  <tr><td><strong>Lara van Wyk</strong><br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 63 891 2345</span></td><td>Rm 12 — Suite</td><td>12 Mar</td><td>Today</td><td>4</td><td><span className="badge badge-checkout">Check-out</span></td><td style={{ fontWeight: 700, color: 'var(--forest)' }}>R 6,800</td></tr>
                  <tr><td><strong>Corporate Event</strong><br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nkosi Holdings</span></td><td>Main Venue</td><td>Today</td><td>Today</td><td>80</td><td><span className="badge badge-confirmed">Confirmed</span></td><td style={{ fontWeight: 700, color: 'var(--gold)' }}>R 15,000</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Ledger snapshot <span>March 2026</span></div>
              <Link to="/ceo/ledger" className="btn btn-outline btn-sm">
                Open ledger
              </Link>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>BnB Revenue</span><span style={{ fontWeight: 700 }}>R 32,450</span></div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '68%' }} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Event Hire</span><span style={{ fontWeight: 700 }}>R 15,800</span></div>
                <div className="progress-bar"><div className="progress-fill gold" style={{ width: '33%' }} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Total Expenses</span><span style={{ fontWeight: 700, color: 'var(--red)' }}>— R 21,300</span></div>
                <div className="progress-bar"><div className="progress-fill red" style={{ width: '45%' }} /></div>
              </div>
              <div style={{ paddingTop: 12, borderTop: '2px solid var(--linen)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Net Profit</span>
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, fontWeight: 700, color: 'var(--forest)' }}>R 26,950</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Activity <span>Today</span></div><span className="card-action">See all <i className="fas fa-chevron-right" /></span></div>
            <div className="card-body">
              <div className="timeline">
                <div className="tl-item"><div className="tl-dot green"><i className="fas fa-bed" /></div><div className="tl-content"><div className="tl-title">Sipho Dlamini checked in</div><div className="tl-desc">Room 3 — Loft Suite</div><div className="tl-time">08:45 AM</div></div></div>
                <div className="tl-item"><div className="tl-dot gold"><i className="fas fa-file-invoice" /></div><div className="tl-content"><div className="tl-title">Invoice #VC-2026-089 sent</div><div className="tl-desc">Nkosi Holdings — R 15,000</div><div className="tl-time">08:12 AM</div></div></div>
                <div className="tl-item"><div className="tl-dot red"><i className="fas fa-exclamation" /></div><div className="tl-content"><div className="tl-title">Low stock alert</div><div className="tl-desc">Toilet paper, dishwashing liquid</div><div className="tl-time">07:30 AM</div></div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Upcoming Events</div></div>
            <div className="card-body">
              <div style={{ padding: '10px 0', borderBottom: '1px solid var(--linen)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div><div style={{ fontSize: 13, fontWeight: 700 }}>Wedding — Sithole Family</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>22 Mar · 120 guests · Venue A</div></div>
                  <span className="badge badge-confirmed">Confirmed</span>
                </div>
              </div>
              <div style={{ padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div><div style={{ fontSize: 13, fontWeight: 700 }}>Corporate Retreat</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>28–30 Mar · 35 people · Full Farm</div></div>
                  <span className="badge badge-pending">Deposit Due</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
