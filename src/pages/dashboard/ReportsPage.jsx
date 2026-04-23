import { useMemo, useState } from 'react';
import { formatMonthYear } from '@/utils/formatDate';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';

const DEMO_LAST_REPORT = new Date(2026, 2, 1);

/** `lastRunMonth` is YYYY-MM for month filter (demo). */
const ALL_REPORTS = [
  {
    icon: 'fas fa-calendar-week',
    name: 'Weekly Summary',
    desc: 'Bookings, income, expenses & staff attendance for the current week.',
    color: 'var(--forest)',
    lastRunMonth: '2026-03',
  },
  {
    icon: 'fas fa-calendar-alt',
    name: 'Monthly Report',
    desc: 'Full financial summary, occupancy rates & operational overview.',
    color: 'var(--gold)',
    lastRunMonth: '2026-03',
  },
  {
    icon: 'fas fa-chart-line',
    name: 'Quarterly Analysis',
    desc: 'Business performance trends over Q1 2026 with YoY comparisons.',
    color: 'var(--sage)',
    lastRunMonth: '2026-01',
  },
];

const RECENT_RUNS = [
  { report: 'Weekly Summary', period: 'Week 13, 2026', generatedAt: '2026-03-31 08:45', format: 'PDF', status: 'Completed' },
  { report: 'Monthly Report', period: 'March 2026', generatedAt: '2026-03-30 17:10', format: 'PDF', status: 'Completed' },
  { report: 'Quarterly Analysis', period: 'Q1 2026', generatedAt: '2026-03-29 14:22', format: 'PDF', status: 'Completed' },
];

const DELIVERY_QUEUE = [
  { report: 'Monthly Report', recipient: 'ceo@valleycroft.co.za', schedule: '1st of month · 08:00', nextRun: '2026-05-01 08:00', status: 'Active' },
  { report: 'Weekly Summary', recipient: 'ops@valleycroft.co.za', schedule: 'Mondays · 07:30', nextRun: '2026-04-27 07:30', status: 'Active' },
];

export default function ReportsPage() {
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  const reports = useMemo(() => {
    let r = ALL_REPORTS;
    if (periodFilter === 'weekly') r = r.filter((x) => x.name.includes('Weekly'));
    if (periodFilter === 'monthly') r = r.filter((x) => x.name.includes('Monthly'));
    if (periodFilter === 'quarterly') r = r.filter((x) => x.name.includes('Quarterly'));
    if (monthFilter) r = r.filter((x) => (x.lastRunMonth || '') === monthFilter);
    if (!search.trim()) return r;
    const q = search.trim().toLowerCase();
    return r.filter((x) => x.name.toLowerCase().includes(q) || x.desc.toLowerCase().includes(q));
  }, [search, periodFilter, monthFilter]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Reports & Analytics</div>
          <div className="page-subtitle">Auto-generated reports · Exportable as PDF</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline">
            <i className="fas fa-envelope" /> Schedule Email
          </button>
          <button type="button" className="btn btn-primary">
            <i className="fas fa-file-pdf" /> Generate Report
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <DashboardListFilters
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search reports…"
          month={monthFilter}
          onMonthChange={setMonthFilter}
        />
        <select className="form-control" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">All periods</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </div>
      <div className="grid-3">
        {reports.length === 0 && <p className="text-muted">No reports match your filters.</p>}
        {reports.map((r) => (
          <div key={r.name} className="report-card">
            <div className="report-icon" style={{ background: `${r.color}20` }}>
              <i className={r.icon} style={{ color: r.color }} />
            </div>
            <div className="report-name">{r.name}</div>
            <div className="report-desc">{r.desc}</div>
            <div className="report-meta">
              <div className="report-date">Last: {formatMonthYear(DEMO_LAST_REPORT)}</div>
              <button type="button" className="btn btn-primary btn-sm">
                <i className="fas fa-download" /> Download
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent report runs</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Period</th>
                <th>Generated</th>
                <th>Format</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_RUNS.map((row) => (
                <tr key={`${row.report}-${row.generatedAt}`}>
                  <td><strong>{row.report}</strong></td>
                  <td>{row.period}</td>
                  <td>{row.generatedAt}</td>
                  <td>{row.format}</td>
                  <td>
                    <span className="badge badge-confirmed">{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Scheduled report delivery</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Recipient</th>
                <th>Schedule</th>
                <th>Next run</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {DELIVERY_QUEUE.map((row) => (
                <tr key={`${row.report}-${row.recipient}`}>
                  <td><strong>{row.report}</strong></td>
                  <td>{row.recipient}</td>
                  <td>{row.schedule}</td>
                  <td>{row.nextRun}</td>
                  <td>
                    <span className="badge badge-confirmed">{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
