import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getFinanceDashboard } from '@/api/finance';
import { normalizeFinanceDashboardResponse, fmtRand, mapFinanceQuickLinkHref } from '@/utils/financeDashboardResponse';

/** @typedef {'ceo' | 'finance' | 'admin'} HomeVariant */

function greetingPrefix() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Operations-style stat cards with zeros — used when API has no `operationsDashboard.cards` (not demo numbers). */
function emptyOperationsStatCards() {
  return [
    {
      tone: 'green',
      icon: 'fas fa-clipboard-check',
      label: 'Pending actions',
      value: (
        <>
          0<span className="stat-unit"> items</span>
        </>
      ),
      trendDir: 'down',
      trendIcon: 'fas fa-arrow-down',
      trendText: '0 cleared since yesterday',
    },
    {
      tone: 'gold',
      icon: 'fas fa-calendar-day',
      label: 'Check-ins today',
      value: '0',
      trendDir: 'up',
      trendIcon: 'fas fa-sun',
      trendText: 'Today',
    },
    {
      tone: 'sage',
      icon: 'fas fa-sign-out-alt',
      label: 'Check-outs today',
      trendDir: 'up',
      trendIcon: 'fas fa-check-circle',
      value: '0',
      trendText: 'Today',
    },
    {
      tone: 'teal',
      icon: 'fas fa-boxes',
      label: 'Stock alerts',
      value: (
        <>
          0<span className="stat-unit"> SKUs</span>
        </>
      ),
      trendDir: 'down',
      trendIcon: 'fas fa-exclamation-triangle',
      trendText: 'No alerts',
    },
  ];
}

function financeTilesToStatCards(tilesList) {
  const tones = ['green', 'gold', 'sage', 'teal'];
  const icons = ['fas fa-chart-line', 'fas fa-file-invoice-dollar', 'fas fa-balance-scale', 'fas fa-truck'];
  return tilesList.slice(0, 4).map((tile, i) => ({
    tone: tones[i % tones.length],
    icon: icons[i % icons.length],
    label: tile.title,
    value: <>{tile.primary}</>,
    trendDir: 'up',
    trendIcon: 'fas fa-circle',
    trendText: tile.lines?.length ? tile.lines.join(' · ') : '—',
  }));
}

function financeScalarStatCards(dash) {
  return [
    {
      tone: 'green',
      icon: 'fas fa-rand-sign',
      label: 'Receipts MTD',
      value: <>{fmtRand(dash?.incomeMtd)}</>,
      trendDir: 'up',
      trendIcon: 'fas fa-minus',
      trendText: dash?.periodLabel || 'Month to date',
    },
    {
      tone: 'gold',
      icon: 'fas fa-file-invoice-dollar',
      label: 'Open invoices',
      value: <>{dash?.openInvoices != null ? String(dash.openInvoices) : '—'}</>,
      trendDir: 'up',
      trendIcon: 'fas fa-minus',
      trendText: 'From dashboard API',
    },
    {
      tone: 'sage',
      icon: 'fas fa-calendar-week',
      label: 'Due this week',
      value: <>{dash?.dueWeekCount != null ? String(dash.dueWeekCount) : '—'}</>,
      trendDir: 'up',
      trendIcon: 'fas fa-minus',
      trendText: 'Invoices due',
    },
    {
      tone: 'teal',
      icon: 'fas fa-user-clock',
      label: 'Debtors',
      value: <>{fmtRand(dash?.debtorsTotal)}</>,
      trendDir: 'up',
      trendIcon: 'fas fa-minus',
      trendText: 'Outstanding',
    },
  ];
}

/**
 * CEO-style home layout shared by CEO, Finance, and Admin dashboards.
 * @param {{ variant: HomeVariant }} props
 */
export default function ExecutiveHomeDashboard({ variant }) {
  const c = CONFIG[variant];
  const to = (segment) => `${c.basePath}/${segment}`;
  const { user } = useAuth();
  const firstName =
    (user && (user.name || user.firstName || user.email || '').toString().trim().split(/\s+/)[0]) || 'there';

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
  const paymentQueue = Array.isArray(dash?.paymentQueue) ? dash.paymentQueue : [];
  const ledgerSnapshot = root?.ledgerSnapshot ?? null;
  const revenueReceiptsMonthly = root?.revenueReceiptsMonthly ?? null;
  const activityToday = Array.isArray(root?.activityToday) ? root.activityToday : dash?.activityToday ?? [];

  const loading = liveEnabled && dashQuery.isPending;
  const settled = liveEnabled && !dashQuery.isPending;

  const statCards = useMemo(() => {
    if (variant === 'finance' && Array.isArray(dash?.tilesList) && dash.tilesList.length > 0) {
      return financeTilesToStatCards(dash.tilesList);
    }
    if (variant === 'finance') {
      return financeScalarStatCards(dash);
    }
    if (operationsDashboard?.cards) {
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
    }
    return emptyOperationsStatCards();
  }, [variant, dash, operationsDashboard]);

  const ring = useMemo(() => {
    const base = { ...c.ring };
    if (occupancy) {
      const pct = Math.min(100, Math.max(0, Number(occupancy.occupancyPct ?? occupancy.pct ?? 0)));
      const occupied = occupancy.occupiedRooms;
      const vacant = occupancy.vacantRooms;
      const maintenance = occupancy.maintenanceRooms;
      const arc = Math.max(0, Math.round((pct / 100) * 196));
      return {
        ...base,
        badge: `${Math.round(pct)}% full`,
        badgeClass: 'badge badge-confirmed',
        stroke: 'var(--forest)',
        dashArray: `${arc} 226`,
        dashOffset: 56,
        centerText: `${Math.round(pct)}%`,
        textFill: 'var(--forest-dark)',
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
      };
    }
    return {
      ...base,
      badge: null,
      badgeClass: 'badge badge-pending',
      stroke: 'var(--linen)',
      dashArray: '0 226',
      dashOffset: 56,
      centerText: loading ? '…' : '—',
      textFill: 'var(--text-muted)',
      info: (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {loading ? 'Loading occupancy…' : 'No occupancy data in the latest dashboard response.'}
        </div>
      ),
    };
  }, [occupancy, c.ring, loading]);

  const mainTable = useMemo(() => {
    const base = c.mainTable;
    const colCount = base.columns?.length ?? 6;

    if (loading) {
      return {
        ...base,
        dateSpan: '',
        rows: (
          <tr>
            <td colSpan={colCount} style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              Loading table…
            </td>
          </tr>
        ),
      };
    }

    if (variant === 'finance') {
      if (paymentQueue.length > 0) {
        return {
          ...base,
          title: base.title,
          dateSpan: dash?.periodLabel || '',
          linkSegment: base.linkSegment ?? 'invoices',
          linkLabel: base.linkLabel ?? 'All invoices',
          rows: (
            <>
              {paymentQueue.map((p, i) => {
                const party = p.customerName ?? p.party ?? p.debtor ?? p.name ?? p.counterparty ?? '—';
                const ref = p.reference ?? p.invoiceNumber ?? p.ref ?? p.id ?? '—';
                const due = p.dueDate ?? p.due ?? p.dueOn ?? '—';
                const amt = p.amount ?? p.balance ?? p.total;
                const status = p.status ?? p.state ?? '—';
                return (
                  <tr key={p._id ?? p.id ?? ref ?? i}>
                    <td>
                      <strong>{String(party)}</strong>
                      {p.subtitle ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{String(p.subtitle)}</div>
                      ) : null}
                    </td>
                    <td>{String(ref)}</td>
                    <td>{String(due).slice(0, 16)}</td>
                    <td style={{ fontWeight: 700 }}>{fmtRand(amt)}</td>
                    <td>
                      <span className="badge badge-pending">{String(status)}</span>
                    </td>
                    <td>
                      <Link to={`${c.basePath}/invoices`} className="btn btn-outline btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </>
          ),
        };
      }
      return {
        ...base,
        dateSpan: dash?.periodLabel || '',
        rows: (
          <tr>
            <td colSpan={colCount} style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              No payment queue items returned from the dashboard API.
            </td>
          </tr>
        ),
      };
    }

    if (movementsToday.length > 0) {
      return {
        ...base,
        title: `Today's movements`,
        dateSpan: '',
        linkSegment: base.linkSegment ?? 'bookings',
        linkLabel: base.linkLabel ?? 'All bookings',
        columns: ['Guest', 'Room', 'Check-in', 'Check-out', 'Guests', 'Status', 'Action'],
        rows: (
          <>
            {movementsToday.map((m, i) => {
              const guest = m.guest ?? m.guestName ?? m.party ?? '—';
              const room = m.room ?? m.roomName ?? '—';
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
                    <span
                      className={
                        String(status).toLowerCase().includes('out') ? 'badge badge-checkout' : 'badge badge-checkin'
                      }
                    >
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
    }

    return {
      ...base,
      dateSpan: settled ? '' : base.dateSpan,
      columns: base.columns?.length >= 7 ? base.columns : ['Guest', 'Room', 'Check-in', 'Check-out', 'Guests', 'Status', 'Action'],
      rows: (
        <tr>
          <td colSpan={7} style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
            No movements for today in the dashboard feed.
          </td>
        </tr>
      ),
    };
  }, [loading, settled, variant, paymentQueue, movementsToday, c.mainTable, c.basePath, dash?.periodLabel]);

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

  const ledgerForUi = useMemo(() => {
    if (ledger) return ledger;
    const fmt = (n) => (n == null ? '—' : fmtRand(n));
    return {
      bnbRevenue: null,
      eventHire: null,
      totalExpenses: null,
      netProfit: null,
      bnbPct: 0,
      eventPct: 0,
      expensePct: 0,
      fmt,
    };
  }, [ledger]);

  const chartBars = useMemo(() => {
    const arr =
      revenueReceiptsMonthly?.months ??
      revenueReceiptsMonthly?.series ??
      revenueReceiptsMonthly?.data ??
      null;
    if (!Array.isArray(arr) || !arr.length) return null;
    const labels = arr.map((x) => String(x.month ?? x.label ?? x.name ?? '').trim()).filter(Boolean);
    const values = arr.map((x) => Number(x.value ?? x.amount ?? x.total ?? NaN)).filter((n) => Number.isFinite(n));
    if (!values.length) return null;
    const max = Math.max(...values);
    const pct = max ? values.map((v) => (v / max) * 100) : values.map(() => 0);
    return { labels: labels.length ? labels.slice(0, 6) : [], values: pct.slice(0, 6) };
  }, [revenueReceiptsMonthly]);

  const chartFooterRight = useMemo(() => {
    const arr =
      revenueReceiptsMonthly?.months ??
      revenueReceiptsMonthly?.series ??
      revenueReceiptsMonthly?.data ??
      null;
    if (!Array.isArray(arr) || !arr.length) return '—';
    const values = arr.map((x) => Number(x.value ?? x.amount ?? x.total ?? NaN)).filter((n) => Number.isFinite(n));
    if (!values.length) return '—';
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return `Avg ${fmtRand(avg)}/period`;
  }, [revenueReceiptsMonthly]);

  const activityCard = useMemo(() => {
    const pickDot = (item) => {
      const t = String(item?.type ?? item?.title ?? item?.message ?? '').toLowerCase();
      if (t.includes('check') && t.includes('in')) return 'green';
      if (t.includes('invoice')) return 'gold';
      if (t.includes('stock') || t.includes('low')) return 'red';
      return 'gold';
    };
    if (!activityToday?.length) {
      return {
        ...c.activity,
        title: c.activity.title || 'Activity',
        span: 'Today',
        items: (
          <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {loading ? 'Loading activity…' : 'No activity items in today’s dashboard feed.'}
          </div>
        ),
      };
    }
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
  }, [activityToday, c.activity, loading]);

  const heroStats = useMemo(() => {
    if (loading) {
      return [
        { value: '—', label: variant === 'finance' ? 'Receipts MTD' : 'Occupancy' },
        { value: '—', label: variant === 'finance' ? 'Open invoices' : 'Rooms occupied' },
        { value: '—', label: variant === 'finance' ? 'Debtors' : 'Receipts MTD' },
      ];
    }
    if (variant === 'finance') {
      return [
        { value: fmtRand(dash?.incomeMtd), label: 'Receipts MTD' },
        { value: dash?.openInvoices != null ? String(dash.openInvoices) : '—', label: 'Open invoices' },
        { value: fmtRand(dash?.debtorsTotal), label: 'Debtors' },
      ];
    }
    const pct = occupancy ? Math.round(Number(occupancy.occupancyPct ?? occupancy.pct ?? 0)) : null;
    return [
      { value: pct != null ? `${pct}%` : '—', label: 'Occupancy' },
      { value: occupancy?.occupiedRooms != null ? String(occupancy.occupiedRooms) : '—', label: 'Rooms occupied' },
      { value: fmtRand(dash?.incomeMtd), label: 'Receipts MTD' },
    ];
  }, [loading, variant, dash, occupancy]);

  const heroSubtitle = useMemo(() => {
    if (dash?.headline) return dash.headline;
    if (dash?.bookingsNote) return dash.bookingsNote;
    if (loading) return 'Loading your dashboard…';
    return 'Live figures from /api/finance/dashboard.';
  }, [dash, loading]);

  const eventsSection = useMemo(() => {
    const dl = dash?.deadlines;
    if (Array.isArray(dl) && dl.length > 0) {
      const rows = dl.slice(0, 4);
      return (
        <>
          {rows.map((d, i) => {
            const title = d.title ?? d.label ?? d.name ?? 'Deadline';
            const sub = d.subtitle ?? d.detail ?? d.due ?? d.date ?? '';
            const badge = d.status ?? d.badge ?? '—';
            return (
              <div
                key={d._id ?? d.id ?? i}
                style={{ padding: '10px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--linen)' : undefined }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{String(title)}</div>
                    {sub ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{String(sub)}</div>
                    ) : null}
                  </div>
                  <span className="badge badge-pending">{String(badge)}</span>
                </div>
              </div>
            );
          })}
        </>
      );
    }
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
        {loading ? 'Loading…' : 'No deadlines in the dashboard feed.'}
      </p>
    );
  }, [dash?.deadlines, loading]);

  return (
    <>
      {dashQuery.isError && (
        <div className="card card--error" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ fontSize: 13 }}>
            {dashQuery.error?.message || 'Could not load dashboard data.'} Empty values below until the request succeeds.
          </div>
        </div>
      )}

      <div className="hero-banner">
        <div className="hero-text">
          <div className="hero-greeting">
            {greetingPrefix()}, {firstName}
          </div>
          <div className="hero-title">{c.hero.title}</div>
          <div className="hero-subtitle">{heroSubtitle}</div>
          <div className="hero-actions">
            {c.hero.actions.map((a) => (
              <Link key={a.to} to={to(a.to)} className={a.btnClass} style={a.linkStyle}>
                <i className={a.icon} /> {a.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="hero-stats-row">
          {heroStats.map((s, i) => (
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
                {loading ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Loading chart…</p>
                ) : chartBars?.labels?.length ? (
                  <div className="bar-chart">
                    {chartBars.labels.map((label, i) => {
                      const h = chartBars.values?.[i];
                      const height = h != null ? `${h}%` : '0%';
                      const tone = i === 2 || i === 5 ? 'gold' : 'forest';
                      return (
                        <div key={`${label}-${i}`} className="bar-wrap">
                          <div className={`bar-col ${tone}`} style={{ height }} />
                          <div className="bar-label">{label}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    No monthly revenue series in the dashboard response for this range.
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.chart1.footerLeft}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{chartFooterRight}</span>
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
                  <span style={{ fontWeight: 700 }}>{ledgerForUi.fmt(ledgerForUi.bnbRevenue)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${ledgerForUi.bnbPct}%` }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Event Hire</span>
                  <span style={{ fontWeight: 700 }}>{ledgerForUi.fmt(ledgerForUi.eventHire)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill gold" style={{ width: `${ledgerForUi.eventPct}%` }} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Expenses</span>
                  <span style={{ fontWeight: 700, color: 'var(--red)' }}>
                    — {ledgerForUi.fmt(ledgerForUi.totalExpenses)}
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill red" style={{ width: `${ledgerForUi.expensePct}%` }} />
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
                  {ledgerForUi.fmt(ledgerForUi.netProfit)}
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
          to: 'booking-payments',
          label: 'Guest payments',
          icon: 'fas fa-credit-card',
          btnClass: OUTLINE_HERO_BTN,
          linkStyle: OUTLINE_ON_DARK,
        },
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
