import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getFinanceDashboard } from '@/api/finance';
import {
  normalizeFinanceDashboardResponse,
  fmtRand,
  mapFinanceQuickLinkHref,
} from '@/utils/financeDashboardResponse';

/**
 * Routes differ by layout: only `/finance` has transactions + invoices; CEO has ledger + debtors; admin has reports.
 * @param {string} basePath
 */
function financePanelNav(basePath) {
  if (basePath === '/finance') {
    return {
      primaryTo: '/finance/transactions',
      primaryLabel: 'Transactions',
      debtorsTo: '/finance/debtors',
      invoicesTo: '/finance/invoices',
    };
  }
  if (basePath === '/ceo') {
    return {
      primaryTo: '/ceo/ledger',
      primaryLabel: 'Ledger',
      debtorsTo: '/ceo/debtors',
      invoicesTo: null,
    };
  }
  if (basePath === '/admin') {
    return {
      primaryTo: '/admin/reports',
      primaryLabel: 'Reports',
      debtorsTo: null,
      invoicesTo: null,
    };
  }
  return {
    primaryTo: `${basePath}/transactions`,
    primaryLabel: 'Transactions',
    debtorsTo: `${basePath}/debtors`,
    invoicesTo: `${basePath}/invoices`,
  };
}

/**
 * Live block from GET /api/finance/dashboard (roles: finance, admin, ceo).
 * Supports `data.controlCentre` (tiles, headline, quickLinks) and `paymentQueue`.
 */
export default function FinanceDashboardApiPanel({ basePath }) {
  const [revenueMonths, setRevenueMonths] = useState(6);

  const query = useQuery({
    queryKey: ['finance', 'dashboard', revenueMonths],
    queryFn: async () => {
      const res = await getFinanceDashboard({ revenueMonths });
      return res?.data !== undefined ? res.data : res;
    },
    retry: false,
  });

  const dash = useMemo(() => normalizeFinanceDashboardResponse(query.data), [query.data]);
  const nav = useMemo(() => financePanelNav(basePath), [basePath]);
  const cc = dash.controlCentre;

  useEffect(() => {
    const am = dash.revenueChartOptions?.activeMonths;
    if (am === 6 || am === 12) setRevenueMonths(am);
  }, [dash.revenueChartOptions?.activeMonths]);

  const pctVsPrior = (current, prior) => {
    if (current == null || prior == null || prior === 0) return null;
    return (((current - prior) / Math.abs(prior)) * 100).toFixed(1);
  };

  const incomeTrend = pctVsPrior(dash.incomeMtd, dash.priorIncomeMtd);
  const expenseTrend = pctVsPrior(dash.expenseMtd, dash.priorExpenseMtd);

  const quickLinks = Array.isArray(cc?.quickLinks) ? cc.quickLinks : [];
  const allowedMonths = dash.revenueChartOptions?.allowedMonths;
  const showRevenueToggle =
    Array.isArray(allowedMonths) && allowedMonths.length > 1 && basePath === '/finance';

  const hasTiles = dash.tilesList?.length > 0;
  const hasLegacyKpi =
    dash.incomeMtd != null ||
    dash.expenseMtd != null ||
    dash.netMtd != null ||
    dash.debtorsTotal != null ||
    dash.invoicesDue != null;
  const hasHeadline = Boolean(dash.headline || cc?.headline);
  const hasQueue = dash.paymentQueue?.length > 0;
  const activityItems = useMemo(() => {
    const items = Array.isArray(dash.activity) ? dash.activity : [];
    return items.filter((item) => {
      const title =
        item?.title ??
        item?.message ??
        item?.description ??
        item?.label ??
        item?.type ??
        (typeof item === 'string' ? item : '');
      const tt = String(title ?? '');
      // Some payloads include helper/debug rows (export labels, login identity).
      return !/export/i.test(tt) && !/login user/i.test(tt);
    });
  }, [dash.activity]);
  const hasActivity = activityItems.length > 0;
  const hasDeadlines = dash.deadlines?.length > 0;
  const hasQuickLinks = quickLinks.length > 0;

  const title = cc?.title || 'Finance overview';

  if (query.isLoading) {
    return (
      <div className="card finance-dash-api-panel" style={{ marginBottom: 18 }}>
        <div className="card-body" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Loading finance dashboard…
        </div>
      </div>
    );
  }

  if (query.isError) {
    const st = query.error?.response?.status;
    return (
      <div className="card card--error finance-dash-api-panel" style={{ marginBottom: 18 }}>
        <div className="card-body" style={{ fontSize: 13 }}>
          {st === 403 || st === 401
            ? 'Finance dashboard KPIs are not available for this role or session.'
            : query.error?.message || 'Could not load finance dashboard.'}
        </div>
      </div>
    );
  }

  const showEmpty =
    !hasTiles &&
    !hasLegacyKpi &&
    !hasHeadline &&
    !hasQueue &&
    !hasActivity &&
    !hasDeadlines &&
    !hasQuickLinks;

  return (
    <div className="card finance-dash-api-panel" style={{ marginBottom: 18 }}>
      <div className="card-header" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="card-title">
            {title} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>live</span>
          </div>
          {dash.periodLabel ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{dash.periodLabel}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {showRevenueToggle ? (
            <div className="finance-dash-seg" role="group" aria-label="Revenue chart window">
              {[6, 12]
                .filter((m) => allowedMonths.includes(m))
                .map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={'finance-dash-seg-btn ' + (revenueMonths === m ? 'active' : '')}
                    onClick={() => setRevenueMonths(m)}
                  >
                    {m}M
                  </button>
                ))}
            </div>
          ) : null}
          <Link to={nav.primaryTo} className="btn btn-outline btn-sm">
            {nav.primaryLabel}
          </Link>
        </div>
      </div>
      <div className="card-body">
        {cc?.ledger && (
          <p className="finance-dash-ledger-hint" style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
            Ledger: <strong style={{ color: 'var(--text-mid)' }}>{cc.ledger.status}</strong>
            {cc.ledger.lastPostedAt != null && (
              <span> · Last posted {String(cc.ledger.lastPostedAt)}</span>
            )}
            {cc.ledger.daysSincePost != null && Number.isFinite(Number(cc.ledger.daysSincePost)) && (
              <span> · {cc.ledger.daysSincePost}d ago</span>
            )}
          </p>
        )}

        {hasHeadline ? (
          <p className="finance-dash-headline" style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--text-mid)' }}>
            {dash.headline || cc?.headline}
          </p>
        ) : null}

        {showEmpty ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Dashboard connected — no KPI payload yet. When the API returns <code>controlCentre</code> /{' '}
            <code>kpis</code>, tiles and queues will appear here.
          </p>
        ) : null}

        {hasTiles ? (
          <div className="finance-dash-kpi-grid finance-dash-kpi-grid--tiles">
            {dash.tilesList.filter((tile) => !/export/i.test(String(tile?.title ?? ''))).map((tile) => (
              <div key={tile.key} className="finance-dash-kpi">
                <span className="finance-dash-kpi-label">{tile.title}</span>
                <span className="finance-dash-kpi-value">{tile.primary}</span>
                {tile.lines?.map((line, li) => (
                  <span key={`${tile.key}-L${li}`} className="finance-dash-kpi-trend neutral">
                    {line}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {!hasTiles && hasLegacyKpi ? (
          <div className="finance-dash-kpi-grid">
            {dash.incomeMtd != null ? (
              <div className="finance-dash-kpi">
                <span className="finance-dash-kpi-label">Income (MTD)</span>
                <span className="finance-dash-kpi-value">{fmtRand(dash.incomeMtd)}</span>
                {incomeTrend != null ? (
                  <span className={'finance-dash-kpi-trend ' + (Number(incomeTrend) >= 0 ? 'up' : 'down')}>
                    {Number(incomeTrend) >= 0 ? '↑' : '↓'} {Math.abs(Number(incomeTrend))}% vs prior month
                  </span>
                ) : null}
              </div>
            ) : null}
            {dash.expenseMtd != null ? (
              <div className="finance-dash-kpi">
                <span className="finance-dash-kpi-label">Expense (MTD)</span>
                <span className="finance-dash-kpi-value">{fmtRand(dash.expenseMtd)}</span>
                {expenseTrend != null ? (
                  <span className={'finance-dash-kpi-trend ' + (Number(expenseTrend) <= 0 ? 'up' : 'down')}>
                    {Number(expenseTrend) <= 0 ? '↓' : '↑'} {Math.abs(Number(expenseTrend))}% vs prior month
                  </span>
                ) : null}
              </div>
            ) : null}
            {dash.netMtd != null ? (
              <div className="finance-dash-kpi">
                <span className="finance-dash-kpi-label">Net (MTD)</span>
                <span
                  className={
                    'finance-dash-kpi-value ' + (dash.netMtd >= 0 ? 'finance-dash-kpi-pos' : 'finance-dash-kpi-neg')
                  }
                >
                  {fmtRand(dash.netMtd)}
                </span>
              </div>
            ) : null}
            {dash.debtorsTotal != null ? (
              <div className="finance-dash-kpi">
                <span className="finance-dash-kpi-label">Debtors (outstanding)</span>
                <span className="finance-dash-kpi-value">{fmtRand(dash.debtorsTotal)}</span>
                {nav.debtorsTo ? (
                  <Link to={nav.debtorsTo} className="finance-dash-kpi-link">
                    Debtors →
                  </Link>
                ) : null}
              </div>
            ) : null}
            {dash.invoicesDue != null ? (
              <div className="finance-dash-kpi">
                <span className="finance-dash-kpi-label">Open / due (count)</span>
                <span className="finance-dash-kpi-value">{dash.invoicesDue}</span>
                {nav.invoicesTo ? (
                  <Link to={nav.invoicesTo} className="finance-dash-kpi-link">
                    Invoices →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Quick links removed from this live control-centre card. */}

        {hasQueue ? (
          <div style={{ marginTop: hasTiles || hasLegacyKpi ? 16 : 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 8,
              }}
            >
              Payment queue
            </div>
            <div className="finance-dash-table-wrap">
              <table className="finance-dash-table">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Reference</th>
                    <th>Due</th>
                    <th className="finance-dash-num">Amount</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.paymentQueue.slice(0, 10).map((row, i) => {
                    const amount =
                      row.amount != null && Number.isFinite(Number(row.amount))
                        ? fmtRand(row.amount)
                        : '—';
                    return (
                      <tr key={row.reference ?? row.id ?? row._id ?? i}>
                        <td>{row.party ?? '—'}</td>
                        <td className="finance-dash-nowrap">{row.reference ?? '—'}</td>
                        <td>{row.dueLabel ?? '—'}</td>
                        <td className="finance-dash-num">{amount}</td>
                        <td>{row.displayStatus ?? '—'}</td>
                        <td>
                          <span className="finance-dash-action">{row.suggestedAction ?? '—'}</span>
                          {row.source ? (
                            <span className="finance-dash-source" title={row.source}>
                              {' '}
                              ({row.source})
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {hasDeadlines ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Deadlines
            </div>
            <ul className="finance-dash-activity-list">
              {dash.deadlines.slice(0, 6).map((d, i) => {
                const title =
                  d.title ?? d.label ?? d.name ?? (typeof d === 'string' ? d : 'Deadline');
                const sub = d.subtitle ?? d.detail ?? d.description ?? '';
                const key = d._id ?? d.id ?? i;
                return (
                  <li key={key}>
                    <strong>{String(title)}</strong>
                    {sub ? <span className="finance-dash-activity-sub">{String(sub)}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!cc?.headline && dash.bookingsNote ? (
          <p className="finance-dash-bookings-note" style={{ margin: '12px 0 0', fontSize: 13 }}>
            {dash.bookingsNote}
          </p>
        ) : null}

        {hasActivity ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {dash.activityIsToday ? 'Activity today' : 'Recent activity'}
            </div>
            <ul className="finance-dash-activity-list">
              {dash.activity
                .filter((item) => {
                  const title =
                    item?.title ??
                    item?.message ??
                    item?.description ??
                    item?.label ??
                    item?.type ??
                    (typeof item === 'string' ? item : '');
                  const t = String(title ?? '');
                  // Some payloads include helper/debug rows (export labels, login identity).
                  return !/export/i.test(t) && !/login user/i.test(t);
                })
                .slice(0, 8)
                .map((item, i) => {
                  const title =
                    item.title ??
                    item.message ??
                    item.description ??
                    item.label ??
                    item.type ??
                    (typeof item === 'string' ? item : 'Entry');
                  const sub = item.subtitle ?? item.detail ?? item.ref ?? item.reference ?? '';
                  const key = item._id ?? item.id ?? i;
                  return (
                    <li key={key}>
                      <strong>{String(title)}</strong>
                      {sub ? <span className="finance-dash-activity-sub">{String(sub)}</span> : null}
                    </li>
                  );
                })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
