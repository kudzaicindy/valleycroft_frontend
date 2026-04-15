import { useMemo, useState } from 'react';
import { formatMonthYear } from '@/utils/formatDate';

const DEMO_LAST_REPORT = new Date(2026, 2, 1);

const ALL_REPORTS = [
  { icon: 'fas fa-calendar-week', name: 'Weekly Summary', desc: 'Bookings, income, expenses & staff attendance for the current week.', color: 'var(--forest)' },
  { icon: 'fas fa-calendar-alt', name: 'Monthly Report', desc: 'Full financial summary, occupancy rates & operational overview.', color: 'var(--gold)' },
  { icon: 'fas fa-chart-line', name: 'Quarterly Analysis', desc: 'Business performance trends over Q1 2026 with YoY comparisons.', color: 'var(--sage)' },
];

export default function ReportsPage() {
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  const reports = useMemo(() => {
    let r = ALL_REPORTS;
    if (periodFilter === 'weekly') r = r.filter((x) => x.name.includes('Weekly'));
    if (periodFilter === 'monthly') r = r.filter((x) => x.name.includes('Monthly'));
    if (periodFilter === 'quarterly') r = r.filter((x) => x.name.includes('Quarterly'));
    if (!search.trim()) return r;
    const q = search.trim().toLowerCase();
    return r.filter((x) => x.name.toLowerCase().includes(q) || x.desc.toLowerCase().includes(q));
  }, [search, periodFilter]);

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
      <div className="bookings-filters-bar" style={{ marginBottom: 12 }}>
        <input
          type="search"
          className="form-control"
          placeholder="Search reports…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
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
          <div className="card-title">
            12-Month Revenue Comparison <span>2025 vs 2026</span>
          </div>
        </div>
        <div className="card-body">
          <div className="bar-chart" style={{ height: 160, gap: 16 }}>
            {['52%', '68%', '72%', '58%', '65%', '70%'].map((h, i) => (
              <div key={i} className="bar-wrap">
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%' }}>
                  <div className="bar-col forest" style={{ height: h, width: 14 }} />
                  <div className="bar-col gold" style={{ height: `${parseFloat(h) + 8}%`, width: 14 }} />
                </div>
                <div className="bar-label">{['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'][i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
