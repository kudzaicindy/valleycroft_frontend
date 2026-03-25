import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFinanceDashboard } from '@/api/finance';
import { normalizeFinanceDashboardResponse, fmtRand, mapFinanceQuickLinkHref } from '@/utils/financeDashboardResponse';

/** @typedef {'ceo' | 'finance' | 'admin'} HomeVariant */

const BAR_HEIGHTS = ['55%', '68%', '80%', '62%', '74%', '88%'];
const BAR_LABELS = ['October', 'November', 'December', 'January', 'February', 'March'];

/**
 * CEO-style home layout shared by CEO, Finance, and Admin dashboards.
 * @param {{ variant: HomeVariant }} props
 */
export default function ExecutiveHomeDashboard({ variant }) {
  const c = CONFIG[variant];
  const to = (segment) => `${c.basePath}/${segment}`;

  const liveEnabled = variant === 'finance' || variant === 'ceo' || variant === 'admin';
  const [revenueMonths, setRevenueMonths] = useState(6);

  const dashQuery = useQuery({
    queryKey: ['finance', 'dashboard-home', variant, revenueMonths],
    enabled: liveEnabled,
    retry: false,
    queryFn: async () => {
      const res = await getFinanceDashboard({ revenueMonths });
      return normalizeFinanceDashboardResponse(res?.data !== undefined ? res.data : res);
    },
  });

  const dash = dashQuery.data;
  const root = dash?.raw ?? null;
  const operationsDashboard = root?.operationsDashboard ?? null;
  const occupancy = operationsDashboard?.occupancy ?? null;
  const movementsToday = Array.isArray(operationsDashboard?.movementsToday)
    ? operationsDashboard.movementsToday
    : [];
  const ledgerSnapshot = root?.ledgerSnapshot ?? null;
  const revenueReceiptsMonthly = root?.revenueReceiptsMonthly ?? null;
  const activityToday = Array.isArray(root?.activityToday) ? root.activityToday : dash?.activityToday ?? [];

  const statCards = useMemo(() => {
    if (!operationsDashboard?.cards) return c.statCards;
    const cards = operationsDashboard.cards;
    const pendingTotal = cards?.pendingActions?.total;
    const pendingCleared = cards?.pendingActions?.clearedSinceYesterday;
    const checkIns = cards?.checkInsToday;
    const checkOuts = cards?.checkOutsToday;
    const stockAlerts = cards?.stockAlerts;

    return [
      {
        tone: 'green',
        icon: 'fas fa-clipboard-check',
        label: 'Pending actions',
        value: (
          <>
            {pendingTotal ?? 0}
            <span className="stat-unit"> items</span>
          </>
        ),
        trendDir: 'down',
        trendIcon: 'fas fa-arrow-down',
        trendText: `${pendingCleared ?? 0} cleared since yesterday`,
      },
      {
        tone: 'gold',
        icon: 'fas fa-calendar-day',
        label: 'Check-ins today',
        value: String(checkIns?.count ?? 0),
        trendDir: 'up',
        trendIcon: 'fas fa-sun',
        trendText: checkIns?.firstAtLabel ? `First at ${checkIns.firstAtLabel}` : 'Today',
      },
      {
        tone: 'sage',
        icon: 'fas fa-sign-out-alt',
        label: 'Check-outs today',
        trendDir: 'up',
        trendIcon: 'fas fa-check-circle',
        value: String(checkOuts?.count ?? 0),
        trendText: checkOuts?.firstAtLabel ? `First out at ${checkOuts.firstAtLabel}` : 'Today',
      },
      {
        tone: 'teal',
        icon: 'fas fa-boxes',
        label: 'Stock alerts',
        value: (
          <>
            {stockAlerts?.count ?? 0}
            <span className="stat-unit"> SKUs</span>
          </>
        ),
        trendDir: 'down',
        trendIcon: 'fas fa-exclamation-triangle',
        trendText: 'Reorder needed',
      },
    ];
  }, [operationsDashboard, c.statCards]);

  const ring = useMemo(() => {
    if (!occupancy) return c.ring;
    const pct = Number(occupancy.occupancyPct ?? occupancy.pct ?? 0);
    const occupied = occupancy.occupiedRooms;
    const vacant = occupancy.vacantRooms;
    const maintenance = occupancy.maintenanceRooms;
    return {
      ...c.ring,
      badge: `${Math.round(pct)}% Full`,
      badgeClass: 'badge badge-confirmed',
      centerText: `${Math.round(pct)}%`,
      info: (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Occupied</div>
            <div style={{ fontWeight: 700, color: 'var(--forest)' }}>{occupied ?? '—'} rooms</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vacant</div>
            <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{vacant ?? '—'} rooms</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Maintenance</div>
            <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{maintenance ?? '—'} rooms</div>
          </div>
        </>
      ),
      // Keep SVG geometry from the design system; swap text + info.
      textFill: 'var(--forest-dark)',
    };
  }, [occupancy, c.ring]);

  const mainTable = useMemo(() => {
    if (!movementsToday.length) return c.mainTable;
    return {
      ...c.mainTable,
      title: `Today's movements`,
      dateSpan: '',
      linkSegment: c.mainTable.linkSegment ?? 'bookings',
      linkLabel: c.mainTable.linkLabel ?? 'All bookings',
      columns: ['Guest', 'Room', 'Check-in', 'Check-out', 'Guests', 'Status', 'Action'],
      rows: (
        <>
          {movementsToday.map((m, i) => {
            const guest = m.guest ?? m.guestName ?? m.party ?? '—';
            const room = m.room ?? m.roomName ?? '—';
            const checkIn = m.checkIn ?? m.check_in ?? 'Today';
            const checkOut = m.checkOut ?? m.check_out ?? '—';
            const guests = m.guestsCount ?? m.guests ?? m.guests_no ?? '';
            const status = m.status ?? m.displayStatus ?? '—';
            const actionHref = m.detailsHref ?? m.href ?? null;
            const actionLabel = m.suggestedAction ?? (m.suggestedActionLabel || 'Details');
            const toHref = actionHref ? mapFinanceQuickLinkHref(actionHref, c.basePath) : null;
            return (
              <tr key={m.trackingCode ?? m.reference ?? m.id ?? i}>
                <td>
                  <strong>{String(guest)}</strong>
                </td>
                <td>{String(room)}</td>
                <td>Today</td>
                <td>{checkOut === '—' ? 'Today' : String(checkOut)}</td>
                <td>{guests !== '' ? String(guests) : '—'}</td>
                <td>
                  <span className={String(status).toLowerCase().includes('out') ? 'badge badge-checkout' : 'badge badge-checkin'}>
                    {String(status).includes('out') ? 'Check-out' : String(status)}
                  </span>
                </td>
                <td>
                  {toHref ? (
                    <Link to={toHref} className="btn btn-primary btn-sm">
                      {String(actionLabel)}
                    </Link>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{String(actionLabel)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </>
      ),
    };
  }, [movementsToday, c.mainTable, c.basePath]);

  const ledger = useMemo(() => {
    if (!ledgerSnapshot) return null;
    const firstNum = (obj, keys) => {
      for (const k of keys) {
        const v = obj?.[k];
        if (v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
      }
      return null;
    };
    const fmt = (n) => (n == null ? '—' : fmtRand(n));
    const bnbRevenue = firstNum(ledgerSnapshot, ['bnbRevenue', 'BnBRevenue', 'bnbRev', 'bnb']);
    const eventHire = firstNum(ledgerSnapshot, ['eventHire', 'EventHire', 'eventsRevenue', 'eventRevenue']);
    const totalExpenses = firstNum(ledgerSnapshot, ['totalExpenses', 'expenses', 'totalExpense', 'totalExpensesMtd', 'expensesMtd']);
    const netProfit = firstNum(ledgerSnapshot, ['netProfit', 'NetProfit', 'profit', 'netIncome']) ?? (bnbRevenue != null && eventHire != null && totalExpenses != null ? bnbRevenue + eventHire - totalExpenses : null);
    const revenueTotal = (bnbRevenue ?? 0) + (eventHire ?? 0);
    const bnbPct = revenueTotal ? ((bnbRevenue ?? 0) / revenueTotal) * 100 : 0;
    const eventPct = revenueTotal ? ((eventHire ?? 0) / revenueTotal) * 100 : 0;
    const expensePct = revenueTotal ? ((totalExpenses ?? 0) / revenueTotal) * 100 : 0;
    return { bnbRevenue, eventHire, totalExpenses, netProfit, bnbPct, eventPct, expensePct, fmt };
  }, [ledgerSnapshot]);

  const chartBars = useMemo(() => {
    const arr =
      revenueReceiptsMonthly?.months ??
      revenueReceiptsMonthly?.series ??
      revenueReceiptsMonthly?.data ??
      null;
    if (!Array.isArray(arr) || !arr.length) {
      return { labels: BAR_LABELS, values: BAR_HEIGHTS.map((x) => Number(x.replace('%', ''))) };
    }
    const labels = arr.map((x) => String(x.month ?? x.label ?? x.name ?? '').trim()).filter(Boolean);
    const values = arr.map((x) => Number(x.value ?? x.amount ?? x.total ?? NaN)).filter((n) => Number.isFinite(n));
    // If labels/values mismatch, fall back.
    if (!values.length) return null;
    const max = Math.max(...values);
    const pct = max ? values.map((v) => (v / max) * 100) : values.map(() => 0);
    // Keep up to 6 for the existing bar layout.
    return { labels: labels.length ? labels.slice(0, 6) : BAR_LABELS, values: pct.slice(0, 6) };
  }, [revenueReceiptsMonthly]);

  const activityCard = useMemo(() => {
    if (!activityToday?.length) return c.activity;
    const pickDot = (item) => {
      const t = String(item?.type ?? item?.title ?? item?.message ?? '').toLowerCase();
      if (t.includes('check') && t.includes('in')) return 'green';
      if (t.includes('invoice')) return 'gold';
      if (t.includes('stock') || t.includes('low')) return 'red';
      return 'gold';
    };
    return {
      ...c.activity,
      title: c.activity.title || 'Activity',
      span: 'Today',
      items: (
        <>
          {activityToday.slice(0, 5).map((item, i) => {
            const title =
              item.title ?? item.message ?? item.description ?? item.label ?? item.type ?? (typeof item === 'string' ? item : 'Entry');
            const desc = item.subtitle ?? item.detail ?? item.ref ?? item.reference ?? '';
            const time = item.time ?? item.timestamp ?? item.at ?? '';
            const dot = pickDot(item);
            return (
              <div className="tl-item" key={item._id ?? item.id ?? i}>
                <div className={`tl-dot ${dot}`}>
                  <i className={dot === 'green' ? 'fas fa-bed' : dot === 'gold' ? 'fas fa-file-invoice' : 'fas fa-exclamation'} />
                </div>
                <div className="tl-content">
                  <div className="tl-title">{String(title)}</div>
                  {desc ? <div className="tl-desc">{String(desc)}</div> : null}
                  {time ? <div className="tl-time">{String(time)}</div> : null}
                  {!time ? <div className="tl-time">Today</div> : null}
                </div>
              </div>
            );
          })}
        </>
      ),
    };
  }, [activityToday, c.activity]);

  return (
    <>
      <div className="hero-banner">
        <div className="hero-text">
          <div className="hero-greeting">{c.hero.greeting}</div>
          <div className="hero-title">{c.hero.title}</div>
          <div className="hero-subtitle">{dash?.headline || c.hero.subtitle}</div>
          <div className="hero-actions">
            {c.hero.actions.map((a) => (
              <Link key={a.to} to={to(a.to)} className={a.btnClass} style={a.linkStyle}>
                <i className={a.icon} /> {a.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="hero-stats-row">
          {c.hero.stats.map((s, i) => (
            <div key={s.label} style={{ display: 'contents' }}>
              {i > 0 ? <div className="hero-divider" /> : null}
              <div className="hero-stat">
                <div className="hero-stat-value">{s.value}</div>
                <div className="hero-stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map((card) => (
          <div key={card.label} className={`stat-card ${card.tone}`}>
            <div className="stat-icon">
              <i className={card.icon} />
            </div>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{card.value}</div>
            <div className={`stat-trend ${card.trendDir}`}>
              <i className={card.trendIcon} /> {card.trendText}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-cols-3-1">
        <div>
          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    {c.chart1.title} <span>{revenueMonths === 12 ? '12M' : '6M'}</span>
                  </div>
                </div>
                <div className="filter-tabs">
                  <div
                    className={`filter-tab ${revenueMonths === 6 ? 'active' : ''}`}
                    onClick={() => setRevenueMonths(6)}
                    role="button"
                    tabIndex={0}
                  >
                    6M
                  </div>
                  <div
                    className={`filter-tab ${revenueMonths === 12 ? 'active' : ''}`}
                    onClick={() => setRevenueMonths(12)}
                    role="button"
                    tabIndex={0}
                  >
                    12M
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="bar-chart">
                  {(chartBars?.labels ?? BAR_LABELS).map((label, i) => {
                    const h = chartBars?.values?.[i];
                    const height = h != null ? `${h}%` : BAR_HEIGHTS[i];
                    const tone = i === 2 || i === 5 ? 'gold' : 'forest';
                    return (
                      <div key={label ?? i} className="bar-wrap">
                      <div
                        className={`bar-col ${tone}`}
                        style={{ height }}
                      />
                      <div className="bar-label">{label ?? BAR_LABELS[i]}</div>
                    </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.chart1.footerLeft}</span>
                  <span style={{ fontSize: 11, color: '#3a8c4e', fontWeight: 700 }}>{c.chart1.footerRight}</span>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">{ring.title}</div>
                {ring.badge ? <span className={ring.badgeClass}>{ring.badge}</span> : null}
              </div>
              <div className="card-body">
                <div className="kpi-ring-wrap">
                  <svg className="donut-svg" width={90} height={90} viewBox="0 0 90 90">
                    <circle cx={45} cy={45} r={36} fill="none" stroke="var(--linen)" strokeWidth={10} />
                    <circle
                      cx={45}
                      cy={45}
                      r={36}
                      fill="none"
                      stroke={ring.stroke}
                      strokeWidth={10}
                      strokeDasharray={ring.dashArray}
                      strokeDashoffset={ring.dashOffset}
                      strokeLinecap="round"
                    />
                    <text
                      x={45}
                      y={50}
                      textAnchor="middle"
                      fontSize={16}
                      fontWeight={700}
                      fill={ring.textFill}
                      fontFamily="Cormorant Garamond, serif"
                    >
                      {ring.centerText}
                    </text>
                  </svg>
                  <div className="kpi-ring-info">{ring.info}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 0 }}>
            <div className="card-header">
              <div className="card-title">
                {mainTable.title} <span>{mainTable.dateSpan}</span>
              </div>
              <Link to={to(mainTable.linkSegment)} className="btn btn-primary btn-sm">
                <i className="fas fa-external-link-alt" /> {mainTable.linkLabel}
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    {mainTable.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{mainTable.rows}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                {c.ledger.title} <span>{c.ledger.span}</span>
              </div>
              <Link to={to(c.ledger.linkSegment)} className="btn btn-outline btn-sm">
                {c.ledger.openLabel}
              </Link>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>BnB Revenue</span>
                  <span style={{ fontWeight: 700 }}>{ledger ? ledger.fmt(ledger.bnbRevenue) : 'R 32,450'}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: ledger ? `${ledger.bnbPct}%` : '68%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Event Hire</span>
                  <span style={{ fontWeight: 700 }}>{ledger ? ledger.fmt(ledger.eventHire) : 'R 15,800'}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill gold" style={{ width: ledger ? `${ledger.eventPct}%` : '33%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Expenses</span>
                  <span style={{ fontWeight: 700, color: 'var(--red)' }}>
                    {ledger ? `— ${ledger.fmt(ledger.totalExpenses)}` : '— R 21,300'}
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill red" style={{ width: ledger ? `${ledger.expensePct}%` : '45%' }} />
                </div>
              </div>
              <div
                style={{
                  paddingTop: 12,
                  borderTop: '2px solid var(--linen)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: 'var(--text-muted)',
                  }}
                >
                  Net Profit
                </span>
                <span
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: 24,
                    fontWeight: 700,
                    color: 'var(--forest)',
                  }}
                >
                  {ledger ? ledger.fmt(ledger.netProfit) : 'R 26,950'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                  {activityCard.title} <span>{activityCard.span}</span>
              </div>
              <span className="card-action">
                See all <i className="fas fa-chevron-right" />
              </span>
            </div>
              <div className="card-body">
                <div className="timeline">{activityCard.items}</div>
              </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">{c.events.title}</div>
            </div>
            <div className="card-body">{c.events.body}</div>
          </div>
        </div>
      </div>
    </>
  );
}

const OUTLINE_HERO_BTN = 'btn btn-outline btn-sm';
const OUTLINE_ON_DARK = { color: '#fff', borderColor: 'rgba(255,255,255,0.3)' };

const CONFIG = {
  ceo: {
    basePath: '/ceo',
    hero: {
      greeting: 'Good Morning, Catherine',
      title: 'Welcome back to ValleyCroft',
      subtitle: 'Everything is running smoothly. 3 check-ins expected today.',
      actions: [
        { to: 'bookings', label: 'New Booking', icon: 'fas fa-plus', btnClass: 'btn btn-gold btn-sm' },
        {
          to: 'reports',
          label: 'View Reports',
          icon: 'fas fa-chart-bar',
          btnClass: OUTLINE_HERO_BTN,
          linkStyle: OUTLINE_ON_DARK,
        },
      ],
      stats: [
        { value: '87%', label: 'Occupancy' },
        { value: '14', label: 'Guests In-House' },
        { value: 'R 48k', label: 'This Month' },
      ],
    },
    statCards: [
      {
        tone: 'green',
        icon: 'fas fa-bed',
        label: 'Active Bookings',
        value: (
          <>
            18<span className="stat-unit"> rooms</span>
          </>
        ),
        trendDir: 'up',
        trendIcon: 'fas fa-arrow-up',
        trendText: '+3 from last week',
      },
      {
        tone: 'gold',
        icon: 'fas fa-rand-sign',
        label: 'Monthly Revenue',
        value: (
          <>
            R 48<span className="stat-unit">,250</span>
          </>
        ),
        trendDir: 'up',
        trendIcon: 'fas fa-arrow-up',
        trendText: '+12% vs last month',
      },
      {
        tone: 'sage',
        icon: 'fas fa-users',
        label: 'Staff On Duty',
        value: (
          <>
            9<span className="stat-unit"> / 12</span>
          </>
        ),
        trendDir: 'up',
        trendIcon: 'fas fa-check-circle',
        trendText: '3 off today',
      },
      {
        tone: 'teal',
        icon: 'fas fa-boxes',
        label: 'Stock Alerts',
        value: (
          <>
            4<span className="stat-unit"> items</span>
          </>
        ),
        trendDir: 'down',
        trendIcon: 'fas fa-exclamation-triangle',
        trendText: 'Reorder needed',
      },
    ],
    chart1: {
      title: 'Revenue Trend',
      span: 'Monthly',
      footerLeft: 'Avg: R 41,200/mo',
      footerRight: '↑ 7.2% YoY',
    },
    ring: {
      title: 'Room Occupancy',
      badge: '87% Full',
      badgeClass: 'badge badge-confirmed',
      stroke: 'var(--forest)',
      dashArray: '196 226',
      dashOffset: 56,
      centerText: '87%',
      textFill: 'var(--forest-dark)',
      info: (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Occupied</div>
            <div style={{ fontWeight: 700, color: 'var(--forest)' }}>13 rooms</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vacant</div>
            <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>2 rooms</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Maintenance</div>
            <div style={{ fontWeight: 700, color: 'var(--gold)' }}>0 rooms</div>
          </div>
        </>
      ),
    },
    mainTable: {
      title: "Today's Bookings",
      dateSpan: '14 March 2026',
      linkSegment: 'bookings',
      linkLabel: 'All Bookings',
      columns: ['Guest', 'Room', 'Check-in', 'Check-out', 'Guests', 'Status', 'Revenue'],
      rows: (
        <>
          <tr>
            <td>
              <strong>Sipho Dlamini</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 82 456 7890</span>
            </td>
            <td>Rm 3 — Loft</td>
            <td>Today</td>
            <td>16 March 2026</td>
            <td>2</td>
            <td>
              <span className="badge badge-checkin">Check-in</span>
            </td>
            <td style={{ fontWeight: 700, color: 'var(--forest)' }}>R 2,400</td>
          </tr>
          <tr>
            <td>
              <strong>Amara Osei</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 71 234 5678</span>
            </td>
            <td>Rm 7 — Garden</td>
            <td>Today</td>
            <td>15 March 2026</td>
            <td>1</td>
            <td>
              <span className="badge badge-checkin">Check-in</span>
            </td>
            <td style={{ fontWeight: 700, color: 'var(--forest)' }}>R 1,200</td>
          </tr>
          <tr>
            <td>
              <strong>Lara van Wyk</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 63 891 2345</span>
            </td>
            <td>Rm 12 — Suite</td>
            <td>12 March 2026</td>
            <td>Today</td>
            <td>4</td>
            <td>
              <span className="badge badge-checkout">Check-out</span>
            </td>
            <td style={{ fontWeight: 700, color: 'var(--forest)' }}>R 6,800</td>
          </tr>
          <tr>
            <td>
              <strong>Corporate Event</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nkosi Holdings</span>
            </td>
            <td>Main Venue</td>
            <td>Today</td>
            <td>Today</td>
            <td>80</td>
            <td>
              <span className="badge badge-confirmed">Confirmed</span>
            </td>
            <td style={{ fontWeight: 700, color: 'var(--gold)' }}>R 15,000</td>
          </tr>
        </>
      ),
    },
    ledger: { title: 'Ledger snapshot', span: 'March 2026', linkSegment: 'ledger', openLabel: 'Open ledger' },
    activity: {
      title: 'Activity',
      span: 'Today',
      items: (
        <>
          <div className="tl-item">
            <div className="tl-dot green">
              <i className="fas fa-bed" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Sipho Dlamini checked in</div>
              <div className="tl-desc">Room 3 — Loft Suite</div>
              <div className="tl-time">08:45 AM</div>
            </div>
          </div>
          <div className="tl-item">
            <div className="tl-dot gold">
              <i className="fas fa-file-invoice" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Invoice #VC-2026-089 sent</div>
              <div className="tl-desc">Nkosi Holdings — R 15,000</div>
              <div className="tl-time">08:12 AM</div>
            </div>
          </div>
          <div className="tl-item">
            <div className="tl-dot red">
              <i className="fas fa-exclamation" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Low stock alert</div>
              <div className="tl-desc">Toilet paper, dishwashing liquid</div>
              <div className="tl-time">07:30 AM</div>
            </div>
          </div>
        </>
      ),
    },
    events: {
      title: 'Upcoming Events',
      body: (
        <>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--linen)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Wedding — Sithole Family</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  22 March 2026 · 120 guests · Venue A
                </div>
              </div>
              <span className="badge badge-confirmed">Confirmed</span>
            </div>
          </div>
          <div style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Corporate Retreat</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  28–30 March 2026 · 35 people · Full Farm
                </div>
              </div>
              <span className="badge badge-pending">Deposit Due</span>
            </div>
          </div>
        </>
      ),
    },
  },

  finance: {
    basePath: '/finance',
    hero: {
      greeting: 'Good Morning, Peter',
      title: 'Finance control centre',
      subtitle: 'Ledgers are current. 2 invoices due this week — nothing overdue.',
      actions: [
        { to: 'transactions', label: 'Transactions', icon: 'fas fa-exchange-alt', btnClass: 'btn btn-gold btn-sm' },
        {
          to: 'chart-of-accounts',
          label: 'Chart of accounts',
          icon: 'fas fa-list-alt',
          btnClass: OUTLINE_HERO_BTN,
          linkStyle: OUTLINE_ON_DARK,
        },
        {
          to: 'cashflow',
          label: 'Cash flow',
          icon: 'fas fa-water',
          btnClass: OUTLINE_HERO_BTN,
          linkStyle: OUTLINE_ON_DARK,
        },
      ],
      stats: [
        { value: 'R 48k', label: 'Receipts MTD' },
        { value: '12', label: 'Open invoices' },
        { value: 'R 8.2k', label: 'Due this week' },
      ],
    },
    statCards: [
      {
        tone: 'green',
        icon: 'fas fa-file-invoice-dollar',
        label: 'Posted this month',
        value: (
          <>
            186<span className="stat-unit"> lines</span>
          </>
        ),
        trendDir: 'up',
        trendIcon: 'fas fa-arrow-up',
        trendText: 'On track vs last month',
      },
      {
        tone: 'gold',
        icon: 'fas fa-rand-sign',
        label: 'Collections MTD',
        value: (
          <>
            R 48<span className="stat-unit">,250</span>
          </>
        ),
        trendDir: 'up',
        trendIcon: 'fas fa-arrow-up',
        trendText: '+12% vs last month',
      },
      {
        tone: 'sage',
        icon: 'fas fa-user-clock',
        label: 'Debtors balance',
        value: (
          <>
            R 14<span className="stat-unit">,100</span>
          </>
        ),
        trendDir: 'up',
        trendIcon: 'fas fa-check-circle',
        trendText: '72% current',
      },
      {
        tone: 'teal',
        icon: 'fas fa-truck',
        label: 'Supplier payables',
        value: (
          <>
            R 6<span className="stat-unit">,400</span>
          </>
        ),
        trendDir: 'down',
        trendIcon: 'fas fa-calendar-alt',
        trendText: '3 payments scheduled',
      },
    ],
    chart1: {
      title: 'Revenue & receipts',
      span: 'Monthly',
      footerLeft: 'Avg: R 41,200/mo',
      footerRight: '↑ 7.2% YoY',
    },
    ring: {
      title: 'Debtor aging',
      badge: '72% current',
      badgeClass: 'badge badge-confirmed',
      stroke: 'var(--forest)',
      dashArray: '163 226',
      dashOffset: 56,
      centerText: '72%',
      textFill: 'var(--forest-dark)',
      info: (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>0–30 days</div>
            <div style={{ fontWeight: 700, color: 'var(--forest)' }}>R 10,200</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>31–60 days</div>
            <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>R 2,900</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>60+ days</div>
            <div style={{ fontWeight: 700, color: 'var(--gold)' }}>R 1,000</div>
          </div>
        </>
      ),
    },
    mainTable: {
      title: 'Invoices & payments',
      dateSpan: 'Due & recent',
      linkSegment: 'invoices',
      linkLabel: 'All invoices',
      columns: ['Party', 'Reference', 'Due', 'Amount', 'Status', 'Action'],
      rows: (
        <>
          <tr>
            <td>
              <strong>Nkosi Holdings</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Event deposit</span>
            </td>
            <td>VC-2026-089</td>
            <td>18 March 2026</td>
            <td style={{ fontWeight: 700 }}>R 15,000</td>
            <td>
              <span className="badge badge-pending">Sent</span>
            </td>
            <td>
              <Link to="/finance/invoices" className="btn btn-outline btn-sm">
                Record
              </Link>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Lara van Wyk</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>BnB folio</span>
            </td>
            <td>VC-2026-091</td>
            <td>Today</td>
            <td style={{ fontWeight: 700, color: 'var(--forest)' }}>R 6,800</td>
            <td>
              <span className="badge badge-checkin">Partial</span>
            </td>
            <td>
              <Link to="/finance/transactions" className="btn btn-primary btn-sm">
                Allocate
              </Link>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Makro Wholesale</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Supplier</span>
            </td>
            <td>PO-4402</td>
            <td>20 March 2026</td>
            <td style={{ fontWeight: 700 }}>R 3,240</td>
            <td>
              <span className="badge badge-confirmed">Approved</span>
            </td>
            <td>
              <Link to="/finance/suppliers" className="btn btn-outline btn-sm">
                Pay
              </Link>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Staff payroll</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>March run</span>
            </td>
            <td>PR-MAR-26</td>
            <td>25 March 2026</td>
            <td style={{ fontWeight: 700, color: 'var(--gold)' }}>R 42,000</td>
            <td>
              <span className="badge badge-confirmed">Scheduled</span>
            </td>
            <td>
              <Link to="/finance/salary" className="btn btn-outline btn-sm">
                Review
              </Link>
            </td>
          </tr>
        </>
      ),
    },
    ledger: { title: 'Ledger snapshot', span: 'March 2026', linkSegment: 'ledger', openLabel: 'Open ledger' },
    activity: {
      title: 'Finance activity',
      span: 'Today',
      items: (
        <>
          <div className="tl-item">
            <div className="tl-dot green">
              <i className="fas fa-check" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Bank feed reconciled</div>
              <div className="tl-desc">32 transactions matched</div>
              <div className="tl-time">09:10 AM</div>
            </div>
          </div>
          <div className="tl-item">
            <div className="tl-dot gold">
              <i className="fas fa-file-invoice" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Invoice #VC-2026-089 issued</div>
              <div className="tl-desc">Nkosi Holdings — R 15,000</div>
              <div className="tl-time">08:12 AM</div>
            </div>
          </div>
          <div className="tl-item">
            <div className="tl-dot red">
              <i className="fas fa-exclamation" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Refund request</div>
              <div className="tl-desc">Guest cancellation — R 1,200</div>
              <div className="tl-time">07:55 AM</div>
            </div>
          </div>
        </>
      ),
    },
    events: {
      title: 'Deadlines & payroll',
      body: (
        <>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--linen)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>March payroll run</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  25 March 2026 · approve by 24 March 2026
                </div>
              </div>
              <span className="badge badge-confirmed">Ready</span>
            </div>
          </div>
          <div style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>VAT return (Feb)</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Due 25 March 2026 · draft in reports
                </div>
              </div>
              <span className="badge badge-pending">Review</span>
            </div>
          </div>
        </>
      ),
    },
  },

  admin: {
    basePath: '/admin',
    hero: {
      greeting: 'Good Morning, Nomsa',
      title: 'Operations dashboard',
      subtitle: '3 check-ins expected today. 7 items need your attention across bookings and stock.',
      actions: [
        { to: 'bookings', label: 'New booking', icon: 'fas fa-plus', btnClass: 'btn btn-gold btn-sm' },
        {
          to: 'inventory',
          label: 'Inventory',
          icon: 'fas fa-boxes',
          btnClass: OUTLINE_HERO_BTN,
          linkStyle: OUTLINE_ON_DARK,
        },
      ],
      stats: [
        { value: '87%', label: 'Occupancy' },
        { value: '14', label: 'Guests In-House' },
        { value: '7', label: 'Pending tasks' },
      ],
    },
    statCards: [
      {
        tone: 'green',
        icon: 'fas fa-clipboard-check',
        label: 'Pending actions',
        value: (
          <>
            7<span className="stat-unit"> items</span>
          </>
        ),
        trendDir: 'down',
        trendIcon: 'fas fa-arrow-down',
        trendText: '2 cleared since yesterday',
      },
      {
        tone: 'gold',
        icon: 'fas fa-calendar-day',
        label: 'Check-ins today',
        value: '3',
        trendDir: 'up',
        trendIcon: 'fas fa-sun',
        trendText: 'First at 10:00',
      },
      {
        tone: 'sage',
        icon: 'fas fa-sign-out-alt',
        label: 'Check-outs today',
        value: '2',
        trendDir: 'up',
        trendIcon: 'fas fa-check-circle',
        trendText: 'Rooms to flip by 14:00',
      },
      {
        tone: 'teal',
        icon: 'fas fa-boxes',
        label: 'Stock alerts',
        value: (
          <>
            4<span className="stat-unit"> SKUs</span>
          </>
        ),
        trendDir: 'down',
        trendIcon: 'fas fa-exclamation-triangle',
        trendText: 'Reorder from suppliers',
      },
    ],
    chart1: {
      title: 'Revenue Trend',
      span: 'Monthly',
      footerLeft: 'Avg: R 41,200/mo',
      footerRight: '↑ 7.2% YoY',
    },
    ring: {
      title: 'Room Occupancy',
      badge: '87% Full',
      badgeClass: 'badge badge-confirmed',
      stroke: 'var(--forest)',
      dashArray: '196 226',
      dashOffset: 56,
      centerText: '87%',
      textFill: 'var(--forest-dark)',
      info: (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Occupied</div>
            <div style={{ fontWeight: 700, color: 'var(--forest)' }}>13 rooms</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vacant</div>
            <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>2 rooms</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Maintenance</div>
            <div style={{ fontWeight: 700, color: 'var(--gold)' }}>0 rooms</div>
          </div>
        </>
      ),
    },
    mainTable: {
      title: "Today's movements",
      dateSpan: '14 March 2026',
      linkSegment: 'bookings',
      linkLabel: 'All bookings',
      columns: ['Guest', 'Room', 'Check-in', 'Check-out', 'Guests', 'Status', 'Action'],
      rows: (
        <>
          <tr>
            <td>
              <strong>Sipho Dlamini</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 82 456 7890</span>
            </td>
            <td>Rm 3 — Loft</td>
            <td>Today</td>
            <td>16 March 2026</td>
            <td>2</td>
            <td>
              <span className="badge badge-checkin">Check-in</span>
            </td>
            <td>
              <Link to="/admin/bookings" className="btn btn-primary btn-sm">
                Check in
              </Link>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Amara Osei</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 71 234 5678</span>
            </td>
            <td>Rm 7 — Garden</td>
            <td>Today</td>
            <td>15 March 2026</td>
            <td>1</td>
            <td>
              <span className="badge badge-checkin">Check-in</span>
            </td>
            <td>
              <Link to="/admin/bookings" className="btn btn-primary btn-sm">
                Check in
              </Link>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Lara van Wyk</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+27 63 891 2345</span>
            </td>
            <td>Rm 12 — Suite</td>
            <td>12 March 2026</td>
            <td>Today</td>
            <td>4</td>
            <td>
              <span className="badge badge-checkout">Check-out</span>
            </td>
            <td>
              <Link to="/admin/bookings" className="btn btn-outline btn-sm">
                Folio
              </Link>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Corporate Event</strong>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nkosi Holdings</span>
            </td>
            <td>Main Venue</td>
            <td>Today</td>
            <td>Today</td>
            <td>80</td>
            <td>
              <span className="badge badge-confirmed">Confirmed</span>
            </td>
            <td>
              <Link to="/admin/bookings" className="btn btn-outline btn-sm">
                Details
              </Link>
            </td>
          </tr>
        </>
      ),
    },
    ledger: {
      title: 'Ledger snapshot',
      span: 'March 2026',
      linkSegment: 'reports',
      openLabel: 'Open reports',
    },
    activity: {
      title: 'Activity',
      span: 'Today',
      items: (
        <>
          <div className="tl-item">
            <div className="tl-dot green">
              <i className="fas fa-bed" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Sipho Dlamini checked in</div>
              <div className="tl-desc">Room 3 — Loft Suite</div>
              <div className="tl-time">08:45 AM</div>
            </div>
          </div>
          <div className="tl-item">
            <div className="tl-dot gold">
              <i className="fas fa-file-invoice" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Invoice #VC-2026-089 sent</div>
              <div className="tl-desc">Nkosi Holdings — R 15,000</div>
              <div className="tl-time">08:12 AM</div>
            </div>
          </div>
          <div className="tl-item">
            <div className="tl-dot red">
              <i className="fas fa-exclamation" />
            </div>
            <div className="tl-content">
              <div className="tl-title">Low stock alert</div>
              <div className="tl-desc">Toilet paper, dishwashing liquid</div>
              <div className="tl-time">07:30 AM</div>
            </div>
          </div>
        </>
      ),
    },
    events: {
      title: 'Upcoming on the farm',
      body: (
        <>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--linen)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Wedding — Sithole Family</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  22 March 2026 · 120 guests · Venue A
                </div>
              </div>
              <span className="badge badge-confirmed">Confirmed</span>
            </div>
          </div>
          <div style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Corporate Retreat</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  28–30 March 2026 · 35 people · Full Farm
                </div>
              </div>
              <span className="badge badge-pending">Deposit Due</span>
            </div>
          </div>
        </>
      ),
    },
  },
};
