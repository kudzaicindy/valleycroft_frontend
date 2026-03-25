import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { formatDateWeekdayDayMonthYear } from '@/utils/formatDate';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const firstName = (user && (user.name || user.firstName || user.email || '').split(/\s+/)[0]) || 'there';
  const today = new Date();
  const dayLabel = formatDateWeekdayDayMonthYear(today);

  return (
    <div className="employee-dashboard">
      <div className="hero-banner hero-banner--emp">
        <div className="hero-text">
          <div className="hero-greeting">{getGreeting()}, {firstName}</div>
          <div className="hero-title">Your Shift Dashboard</div>
          <div className="hero-subtitle">{dayLabel}</div>
          <div className="hero-actions">
            <Link to="/employee/log-work" className="btn btn-gold btn-sm"><i className="fas fa-pen-fancy" /> Log Work</Link>
            <Link to="/employee/my-logs" className="btn btn-outline btn-sm btn-ghost-light"><i className="fas fa-list" /> My Logs</Link>
          </div>
        </div>
        <div className="hero-stats-row">
          <div className="hero-stat"><div className="hero-stat-value">—</div><div className="hero-stat-label">Tasks Today</div></div>
          <div className="hero-divider" />
          <div className="hero-stat"><div className="hero-stat-value">—</div><div className="hero-stat-label">Done</div></div>
          <div className="hero-divider" />
          <div className="hero-stat"><div className="hero-stat-value">—</div><div className="hero-stat-label">My Logs</div></div>
        </div>
      </div>
      <div className="grid-2">
        <div>
          <div className="section-header">
            <div className="section-title">Quick Links</div>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link to="/employee/log-work" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                <i className="fas fa-pen-fancy" /> Log Work
              </Link>
              <Link to="/employee/my-logs" className="btn btn-outline" style={{ justifyContent: 'center' }}>
                <i className="fas fa-list" /> View My Logs
              </Link>
              <Link to="/employee/payslips" className="btn btn-outline" style={{ justifyContent: 'center' }}>
                <i className="fas fa-file-invoice-dollar" /> Payslips
              </Link>
            </div>
          </div>
          <div className="section-header"><div className="section-title">My Tasks <span>Today</span></div><span className="badge badge-pending">—</span></div>
          <div className="emp-task-card">
            <div className="task-priority priority-medium" />
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>No tasks assigned yet</div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Tasks from your manager will appear here</div></div>
            <span className="badge badge-pending">Pending</span>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Log Today&apos;s Work</div></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Submit your work log for the day or week. Your submissions are visible under My Logs.</p>
            <Link to="/employee/log-work" className="btn btn-primary" style={{ width: '100%' }}><i className="fas fa-pen-fancy" /> Go to Log Work</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
