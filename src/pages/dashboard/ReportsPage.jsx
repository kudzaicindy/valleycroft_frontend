export default function ReportsPage() {
  const reports = [
    { icon: 'fas fa-calendar-week', name: 'Weekly Summary', desc: 'Bookings, income, expenses & staff attendance for the current week.', color: 'var(--forest)' },
    { icon: 'fas fa-calendar-alt', name: 'Monthly Report', desc: 'Full financial summary, occupancy rates & operational overview.', color: 'var(--gold)' },
    { icon: 'fas fa-chart-line', name: 'Quarterly Analysis', desc: 'Business performance trends over Q1 2026 with YoY comparisons.', color: 'var(--sage)' },
  ];
  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Reports & Analytics</div>
          <div className="page-subtitle">Auto-generated reports · Exportable as PDF</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline"><i className="fas fa-envelope" /> Schedule Email</button>
          <button type="button" className="btn btn-primary"><i className="fas fa-file-pdf" /> Generate Report</button>
        </div>
      </div>
      <div className="grid-3">
        {reports.map((r) => (
          <div key={r.name} className="report-card">
            <div className="report-icon" style={{ background: `${r.color}20` }}><i className={r.icon} style={{ color: r.color }} /></div>
            <div className="report-name">{r.name}</div>
            <div className="report-desc">{r.desc}</div>
            <div className="report-meta"><div className="report-date">Last: Mar 2026</div><button type="button" className="btn btn-primary btn-sm"><i className="fas fa-download" /> Download</button></div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">12-Month Revenue Comparison <span>2025 vs 2026</span></div></div>
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
