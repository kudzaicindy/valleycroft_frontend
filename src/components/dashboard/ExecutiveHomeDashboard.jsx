import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getFinanceDashboard } from '@/api/finance';
import { getGuestBookings } from '@/api/guestBookings';
import { getBookings } from '@/api/bookings';
import { getEquipment, getStock } from '@/api/inventory';
import { normalizeFinanceDashboardResponse, fmtRand, mapFinanceQuickLinkHref } from '@/utils/financeDashboardResponse';
import { getInventorySnapshotForMonth } from '@/utils/inventoryDemoData';
import { inventorySnapshotFromRows, normalizeInventoryPayload } from '@/utils/inventoryData';
import { FARM_STAYS } from '@/content/farmStays';

/** @typedef {'ceo' | 'finance' | 'admin'} HomeVariant */

function greetingPrefix() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtRandCompact(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}R${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${v < 0 ? '-' : ''}R${(abs / 1_000).toFixed(1)}K`;
  return `${v < 0 ? '-' : ''}R${Math.round(abs)}`;
}

function monthKey(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function recentMonthKeys(count) {
  const n = Number.isFinite(Number(count)) ? Math.max(1, Number(count)) : 6;
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

const COMPILED_REPORTS_STORAGE_KEY = 'valleycroft_compiled_reports_v1';

function formatMonthKeyLabel(key) {
  const raw = String(key || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return raw || 'Current month';
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return raw;
  return new Date(y, mm - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Month-scoped sold nights % when present; otherwise point-in-time `occupancyPct`. */
function displayOccupancyPct(occupancy) {
  if (!occupancy || typeof occupancy !== 'object') return null;
  if (occupancy.selectedMonthOccupancyPct != null && occupancy.selectedMonthOccupancyPct !== '') {
    const n = Number(occupancy.selectedMonthOccupancyPct);
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, n));
  }
  const fallback = Number(occupancy.occupancyPct ?? occupancy.pct);
  if (Number.isFinite(fallback)) return Math.min(100, Math.max(0, fallback));
  return null;
}

function occupancyOverallMonthRow(operationsDashboard, monthKey) {
  const arr = operationsDashboard?.monthlyByRoom?.overallByMonth;
  if (!Array.isArray(arr) || !monthKey) return null;
  return arr.find((r) => String(r?.key) === String(monthKey)) ?? null;
}

function listFromResponseEnvelope(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function readCompiledReportsFromStorage() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMPILED_REPORTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function financeTilesToStatCards(tilesList, dash, occupancy, monthNightRow, periodLabel) {
  const tones = ['green', 'gold', 'sage', 'teal'];
  const icons = ['fas fa-chart-line', 'fas fa-file-invoice-dollar', 'fas fa-balance-scale', 'fas fa-truck'];
  const unifiedRevenue = dash?.revenueMtd ?? dash?.incomeMtd;
  const occPct = displayOccupancyPct(occupancy);
  const occupancyPct =
    occPct != null ? `${Math.round(occPct)}%` : '—';
  return tilesList.slice(0, 4).map((tile, i) => {
    const lower = String(tile?.title ?? '').toLowerCase();
    const isCollectionsTile = lower.includes('collection');
    const displayValue =
      isCollectionsTile
        ? occupancyPct
        : (lower.includes('receipt') || lower.includes('revenue')) && unifiedRevenue != null
          ? fmtRand(unifiedRevenue)
          : tile.primary;
    const occupancyDetails = [
      occupancy?.occupiedRooms != null ? `${occupancy.occupiedRooms} occupied now` : null,
      occupancy?.vacantRooms != null ? `${occupancy.vacantRooms} vacant` : null,
    ].filter(Boolean);
    const nightsLine =
      monthNightRow &&
      Number.isFinite(Number(monthNightRow.soldNights)) &&
      Number.isFinite(Number(monthNightRow.availableNights))
        ? `${Number(monthNightRow.soldNights)} / ${Number(monthNightRow.availableNights)} nights (${periodLabel || formatMonthKeyLabel(monthNightRow.key)})`
        : null;
    const trendText = isCollectionsTile
      ? [nightsLine, occupancyDetails.join(' · ')].filter(Boolean).join(' · ') || 'Occupancy for selected month'
      : tile.lines?.length
        ? tile.lines.join(' · ')
        : '—';
    return {
      tone: tones[i % tones.length],
      icon: isCollectionsTile ? 'fas fa-bed' : icons[i % icons.length],
      label: isCollectionsTile ? 'Occupancy' : tile.title,
      value: <>{displayValue}</>,
      trendDir: 'up',
      trendIcon: 'fas fa-circle',
      trendText,
    };
  });
}

function financeScalarStatCards(dash) {
  const receiptsMtd = dash?.revenueMtd ?? dash?.incomeMtd;
  return [
    {
      tone: 'green',
      icon: 'fas fa-rand-sign',
      label: 'Receipts MTD',
      value: <>{fmtRand(receiptsMtd)}</>,
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
  const userRole = String(user?.role || '').toLowerCase();
  const firstName =
    (user && (user.name || user.firstName || user.email || '').toString().trim().split(/\s+/)[0]) || 'there';

  const liveEnabled = variant === 'finance' || variant === 'ceo' || variant === 'admin';
  const showBnbInsights = variant === 'finance' || variant === 'admin' || variant === 'ceo';
  const [revenueMonths, setRevenueMonths] = useState(6);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const selectedMonthNum = Number(selectedMonth);
  const selectedYearNum = Number(selectedYear);
  const selectedAnchorDate = useMemo(() => {
    const year = Number.isFinite(selectedYearNum) ? selectedYearNum : currentYear;
    const month = Number.isFinite(selectedMonthNum) && selectedMonthNum >= 1 && selectedMonthNum <= 12
      ? selectedMonthNum - 1
      : currentMonth;
    return new Date(year, month, 1);
  }, [selectedYearNum, selectedMonthNum, currentYear, currentMonth]);
  const yearOptions = useMemo(() => {
    const base = currentYear;
    return Array.from({ length: 7 }, (_, i) => String(base - 5 + i));
  }, [currentYear]);
  const selectedMonthKey = useMemo(
    () => `${selectedYearNum}-${String(selectedMonthNum).padStart(2, '0')}`,
    [selectedYearNum, selectedMonthNum]
  );
  const inventoryQuery = useQuery({
    queryKey: ['inventory', 'dashboard', selectedMonthKey],
    enabled: variant === 'admin' || userRole === 'admin',
    retry: false,
    queryFn: async () => {
      const [stockResult, equipmentResult] = await Promise.allSettled([getStock(), getEquipment()]);
      const stockRes = stockResult.status === 'fulfilled' ? stockResult.value : null;
      const equipmentRes = equipmentResult.status === 'fulfilled' ? equipmentResult.value : null;
      return normalizeInventoryPayload(stockRes?.data ?? stockRes, equipmentRes?.data ?? equipmentRes);
    },
  });
  const inventorySnapshot = useMemo(
    () => {
      const apiRows = Array.isArray(inventoryQuery.data) ? inventoryQuery.data : [];
      if (apiRows.length) return inventorySnapshotFromRows(apiRows, selectedMonthKey);
      return getInventorySnapshotForMonth(selectedMonthKey);
    },
    [inventoryQuery.data, selectedMonthKey]
  );

  const dashQuery = useQuery({
    queryKey: ['finance', 'dashboard-home', variant, revenueMonths, selectedMonth, selectedYear],
    enabled: liveEnabled,
    retry: false,
    queryFn: async () => {
      const params = { revenueMonths };
      if (Number.isFinite(selectedMonthNum)) params.month = selectedMonthNum;
      if (Number.isFinite(selectedYearNum)) params.year = selectedYearNum;
      const res = await getFinanceDashboard(params);
      return normalizeFinanceDashboardResponse(res?.data !== undefined ? res.data : res);
    },
  });

  const dash = dashQuery.data;
  const root = dash?.raw ?? null;
  const dashboardRole = String(root?.meta?.role || '').toLowerCase();
  const isAdminContext = variant === 'admin' || dashboardRole === 'admin' || userRole === 'admin';
  const operationsDashboard = root?.operationsDashboard ?? null;
  const occupancy = operationsDashboard?.occupancy ?? null;
  const occupancyMonthRow = useMemo(
    () => occupancyOverallMonthRow(operationsDashboard, selectedMonthKey),
    [operationsDashboard, selectedMonthKey]
  );
  const movementsToday = Array.isArray(operationsDashboard?.movementsToday)
    ? operationsDashboard.movementsToday
    : [];
  const paymentQueue = Array.isArray(dash?.paymentQueue) ? dash.paymentQueue : [];
  const ledgerSnapshot = root?.ledgerSnapshot ?? null;
  const cashflowMonthly = root?.cashflowMonthly ?? null;
  const revenueMonthly = root?.revenueMonthly ?? null;
  const revenueReceiptsMonthly = root?.revenueReceiptsMonthly ?? null;
  const activityToday = Array.isArray(root?.activityToday) ? root.activityToday : dash?.activityToday ?? [];
  const bnbBookingsQuery = useQuery({
    queryKey: ['guest-bookings', 'dashboard-bnb-performance', revenueMonths],
    enabled: liveEnabled,
    staleTime: 60 * 1000,
    queryFn: () => getGuestBookings({ limit: 500 }),
  });
  const internalBookingsQuery = useQuery({
    queryKey: ['bookings', 'dashboard-bnb-performance', revenueMonths],
    enabled: liveEnabled,
    staleTime: 60 * 1000,
    queryFn: () => getBookings({ limit: 500 }),
  });
  const bnbBookingsRaw = listFromResponseEnvelope(bnbBookingsQuery.data);
  const internalBookingsRaw = listFromResponseEnvelope(internalBookingsQuery.data);
  const dashboardBookings = useMemo(() => {
    const rows = [...bnbBookingsRaw, ...internalBookingsRaw];
    if (rows.length <= 1) return rows;
    const deduped = new Map();
    rows.forEach((row, idx) => {
      const key = String(
        row?._id ??
        row?.id ??
        row?.trackingCode ??
        row?.reference ??
        `${row?.guestName || 'guest'}-${row?.checkIn || row?.createdAt || idx}`
      );
      if (!deduped.has(key)) deduped.set(key, row);
    });
    return [...deduped.values()];
  }, [bnbBookingsRaw, internalBookingsRaw]);

  const loading = liveEnabled && dashQuery.isPending;
  const settled = liveEnabled && !dashQuery.isPending;

  const statCards = useMemo(() => {
    if (variant === 'finance' && Array.isArray(dash?.tilesList) && dash.tilesList.length > 0) {
      return financeTilesToStatCards(dash.tilesList, dash, occupancy, occupancyMonthRow, dash?.periodLabel);
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
      const stockAlertsCount = isAdminContext ? inventorySnapshot.lowCount : (stockAlerts?.count ?? 0);
      const stockAlertsTrendText = isAdminContext
        ? `${inventorySnapshot.lowCount} low of ${inventorySnapshot.totalCount} items`
        : 'Reorder needed';

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
              {stockAlertsCount}
              <span className="stat-unit"> SKUs</span>
            </>
          ),
          trendDir: 'down',
          trendIcon: 'fas fa-exclamation-triangle',
          trendText: stockAlertsTrendText,
        },
      ];
    }
    if (isAdminContext) {
      const cards = emptyOperationsStatCards();
      return cards.map((card) =>
        card.label === 'Stock alerts'
          ? {
              ...card,
              value: (
                <>
                  {inventorySnapshot.lowCount}
                  <span className="stat-unit"> SKUs</span>
                </>
              ),
              trendText: `${inventorySnapshot.lowCount} low of ${inventorySnapshot.totalCount} items`,
            }
          : card
      );
    }
    return emptyOperationsStatCards();
  }, [variant, dash, operationsDashboard, occupancy, occupancyMonthRow, inventorySnapshot, isAdminContext]);

  const ring = useMemo(() => {
    const base = { ...c.ring };
    if (occupancy) {
      const pctRaw = displayOccupancyPct(occupancy);
      const pct = pctRaw != null ? pctRaw : 0;
      const occupied = occupancy.occupiedRooms;
      const vacant = occupancy.vacantRooms;
      const maintenance = occupancy.maintenanceRooms;
      const arc = Math.max(0, Math.round((pct / 100) * 196));
      const monthLabel = dash?.periodLabel || formatMonthKeyLabel(selectedMonthKey);
      const soldN = occupancyMonthRow != null ? Number(occupancyMonthRow.soldNights) : NaN;
      const availN = occupancyMonthRow != null ? Number(occupancyMonthRow.availableNights) : NaN;
      const hasNights = Number.isFinite(soldN) && Number.isFinite(availN);
      const usesMonthPct =
        occupancy.selectedMonthOccupancyPct != null &&
        occupancy.selectedMonthOccupancyPct !== '' &&
        Number.isFinite(Number(occupancy.selectedMonthOccupancyPct));
      return {
        ...base,
        badge: usesMonthPct ? `${Math.round(pct)}% · month` : `${Math.round(pct)}% full`,
        badgeClass: 'badge badge-confirmed',
        stroke: 'var(--forest)',
        dashArray: `${arc} 226`,
        dashOffset: 56,
        centerText: `${Math.round(pct)}%`,
        textFill: 'var(--forest-dark)',
        info: (
          <>
            {hasNights ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sold nights ({monthLabel})</div>
                <div style={{ fontWeight: 700, color: 'var(--forest)' }}>
                  {soldN} / {availN}
                </div>
              </div>
            ) : null}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Occupied now</div>
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
  }, [occupancy, occupancyMonthRow, dash?.periodLabel, selectedMonthKey, c.ring, loading]);

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
    const revenueTotal =
      bnbRevenue != null || eventHire != null ? Number(bnbRevenue ?? 0) + Number(eventHire ?? 0) : null;
    const computedNet =
      revenueTotal != null && totalExpenses != null ? revenueTotal - totalExpenses : null;
    const apiNet = firstNum(ledgerSnapshot, ['netProfit', 'NetProfit', 'profit', 'netIncome']);
    const netProfit = computedNet != null ? computedNet : apiNet;
    // Use a common max baseline so bar lengths are visually comparable and accurate.
    const bnbAbs = Math.max(0, Number(bnbRevenue ?? 0));
    const eventAbs = Math.max(0, Number(eventHire ?? 0));
    const expenseAbs = Math.max(0, Number(totalExpenses ?? 0));
    const baseline = Math.max(1, bnbAbs, eventAbs, expenseAbs);
    const bnbPct = (bnbAbs / baseline) * 100;
    const eventPct = (eventAbs / baseline) * 100;
    const expensePct = (expenseAbs / baseline) * 100;
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

  const buildTrend = (chartRoot, limit = 6, anchorDate = null) => {
    const pickNum = (obj, keys) => {
      for (const k of keys) {
        const raw = obj?.[k];
        if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
      }
      return null;
    };

    let arr =
      chartRoot?.months ??
      chartRoot?.series ??
      chartRoot?.data ??
      chartRoot?.points ??
      chartRoot?.items ??
      null;

    // Some responses send parallel arrays instead of row objects.
    if (!Array.isArray(arr)) {
      const labels = chartRoot?.labels ?? chartRoot?.monthKeys ?? chartRoot?.monthsList ?? null;
      const inflows = chartRoot?.inflow ?? chartRoot?.inflows ?? chartRoot?.receipts ?? chartRoot?.revenue ?? null;
      const outflows = chartRoot?.outflow ?? chartRoot?.outflows ?? chartRoot?.expenses ?? null;
      const nets = chartRoot?.net ?? chartRoot?.netFlow ?? chartRoot?.netCashflow ?? null;
      if (Array.isArray(labels) && (Array.isArray(inflows) || Array.isArray(outflows) || Array.isArray(nets))) {
        const len = labels.length;
        arr = Array.from({ length: len }, (_, i) => ({
          label: labels[i],
          inflow: Array.isArray(inflows) ? inflows[i] : null,
          outflow: Array.isArray(outflows) ? outflows[i] : null,
          net: Array.isArray(nets) ? nets[i] : null,
        }));
      }
    }

    if (!Array.isArray(arr) || !arr.length) return null;

    const toTime = (x) => {
      const candidates = [x?.monthKey, x?.key, x?.month, x?.date, x?.period];
      for (const raw of candidates) {
        if (!raw) continue;
        const s = String(raw).trim();
        const ymMatch = s.match(/^(\d{4})-(\d{2})$/);
        if (ymMatch) {
          const y = Number(ymMatch[1]);
          const m = Number(ymMatch[2]);
          return new Date(y, m - 1, 1).getTime();
        }
        const t = new Date(s).getTime();
        if (!Number.isNaN(t)) return t;
      }
      return null;
    };

    const normalized = arr
      .map((x, idx) => {
        const label = String(x?.month ?? x?.monthKey ?? x?.label ?? x?.name ?? x?.key ?? '').trim();
        const inflow =
          pickNum(x, ['inflow', 'cashInflow', 'cashIn', 'receipts', 'revenue', 'income', 'collections', 'grossIncome']) ??
          pickNum(x, ['value', 'amount', 'total']);
        let outflow = pickNum(x, ['outflow', 'cashOutflow', 'cashOut', 'expense', 'expenses', 'refunds', 'cost']);
        if (outflow != null) outflow = Math.abs(outflow);
        let net = pickNum(x, ['net', 'netFlow', 'netCashflow', 'netCashFlow', 'netReceipts', 'netCashFlow']);
        if (net == null && inflow != null && outflow != null) net = inflow - outflow;
        if (outflow == null && inflow != null && net != null) outflow = inflow - net;
        return { label, inflow, outflow, net, __idx: idx, __t: toTime(x) };
      })
      .filter((p) => p.label && (p.inflow != null || p.outflow != null || p.net != null));

    // Ensure chart months are chronological, then take the most recent N points.
    normalized.sort((a, b) => {
      const at = a.__t;
      const bt = b.__t;
      if (at != null && bt != null) return at - bt;
      if (at != null) return -1;
      if (bt != null) return 1;
      return a.__idx - b.__idx;
    });

    const anchorTime = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1).getTime()
      : null;
    const scoped = anchorTime == null ? normalized : normalized.filter((p) => p.__t == null || p.__t <= anchorTime);
    const points = scoped.slice(-limit).map(({ __idx, __t, ...p }) => p);

    if (!points.length) return null;
    const seriesValues = points.flatMap((p) => [Number(p.inflow ?? 0), Number(p.outflow ?? 0), Number(p.net ?? 0)]);
    const minVal = Math.min(0, ...seriesValues);
    const maxVal = Math.max(1, ...seriesValues);
    const range = Math.max(1, maxVal - minVal);
    const n = points.length;
    const xMin = 0;
    const xMax = 100;
    const yMin = 10;
    const yMax = 80;
    const toY = (v) => yMax - (((v ?? 0) - minVal) / range) * (yMax - yMin);
    const yMid = toY(0);
    const toCoords = (key) =>
      points.map((p, i) => {
        const x = n === 1 ? 50 : (i / (n - 1)) * 100;
        return { x, y: toY(p[key]) };
      });
    const toPoints = (key) =>
      toCoords(key)
        .map((p) => `${p.x},${p.y}`)
        .join(' ');

    const avgNet = points.reduce((sum, p) => sum + (p.net ?? 0), 0) / points.length;
    const netCoords = toCoords('net');
    const netAreaPoints =
      netCoords.length > 1
        ? `${netCoords.map((p) => `${p.x},${p.y}`).join(' ')} ${netCoords[netCoords.length - 1].x},${yMid} ${netCoords[0].x},${yMid}`
        : '';
    const latest = points[points.length - 1] ?? null;
    const yTicks = [maxVal, maxVal - range * 0.25, maxVal - range * 0.5, maxVal - range * 0.75, minVal];
    return {
      labels: points.map((p) => p.label),
      series: points,
      inflowPoints: toPoints('inflow'),
      outflowPoints: toPoints('outflow'),
      netPoints: toPoints('net'),
      inflowCoords: toCoords('inflow'),
      outflowCoords: toCoords('outflow'),
      netCoords,
      netAreaPoints,
      xGuides: netCoords.map((p) => p.x),
      latestInflow: latest?.inflow ?? null,
      latestOutflow: latest?.outflow ?? null,
      latestNet: latest?.net ?? null,
      maxSeries: Math.max(1, ...points.map((p) => Math.max(Math.abs(p.inflow ?? 0), Math.abs(p.outflow ?? 0)))),
      yTicks,
      yMid,
      xMin,
      xMax,
      yMin,
      yMax,
      avgNet,
    };
  };

  const cashTrend = useMemo(
    () => buildTrend(cashflowMonthly ?? null, revenueMonths, selectedAnchorDate),
    [cashflowMonthly, revenueMonths, selectedAnchorDate],
  );

  const revenueExpenseTrend = useMemo(
    () => buildTrend(revenueMonthly ?? revenueReceiptsMonthly ?? cashflowMonthly ?? null, revenueMonths, selectedAnchorDate),
    [revenueMonthly, revenueReceiptsMonthly, cashflowMonthly, revenueMonths, selectedAnchorDate],
  );

  const chartFooterRight = useMemo(() => {
    const activeTrend = variant === 'finance' ? cashTrend : revenueExpenseTrend;
    if (!activeTrend) return '—';
    return `Avg Net ${fmtRand(activeTrend.avgNet)}/period`;
  }, [variant, cashTrend, revenueExpenseTrend]);

  const financeChartSummary = useMemo(() => {
    if (variant !== 'finance' || !revenueExpenseTrend?.series?.length) return null;
    const latest = revenueExpenseTrend.series[revenueExpenseTrend.series.length - 1];
    const inflow = Number(latest?.inflow ?? 0);
    const outflow = Math.abs(Number(latest?.outflow ?? 0));
    const net = Number(latest?.net ?? inflow - outflow);
    const incomeVsExpenses = inflow > 0 ? ((inflow - outflow) / inflow) * 100 : 0;
    const netMargin = inflow > 0 ? (net / inflow) * 100 : 0;
    const cashBalance = ledgerForUi?.netProfit ?? net;
    return { incomeVsExpenses, netMargin, cashBalance };
  }, [variant, revenueExpenseTrend, ledgerForUi]);

  const revenueExpTicks = useMemo(() => {
    if (!revenueExpenseTrend) return [];
    const max = Number(revenueExpenseTrend.maxSeries ?? 0);
    return [max, max * 0.75, max * 0.5, max * 0.25, 0];
  }, [revenueExpenseTrend]);

  const bnbPerformance = useMemo(() => {
    if (!showBnbInsights) return null;
    const monthKeys = (() => {
      const n = Number.isFinite(Number(revenueMonths)) ? Math.max(1, Number(revenueMonths)) : 6;
      const anchor = selectedAnchorDate;
      const out = [];
      for (let i = n - 1; i >= 0; i -= 1) {
        const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
        out.push(monthKey(d));
      }
      return out;
    })();
    const monthSet = new Set(monthKeys);
    const stayDefs = FARM_STAYS.map((s) => ({
      key: s.slug,
      name: s.name,
      aliases: [s.name, ...(s.legacyNames || [])].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean),
    }));
    const unknownKey = 'unknown';
    const byStay = new Map();
    const ensure = (key, name) => {
      if (!byStay.has(key)) {
        byStay.set(key, {
          key,
          name,
          totalRevenue: 0,
          monthsBooked: new Set(),
          monthlyRevenue: new Map(),
          bookingCount: 0,
        });
      }
      return byStay.get(key);
    };
    stayDefs.forEach((s) => ensure(s.key, s.name));

    for (const b of dashboardBookings) {
      const status = String(b?.status || '').toLowerCase();
      if (status === 'cancelled') continue;
      const bookingType = String(b?.type ?? b?.bookingType ?? b?.category ?? '').toLowerCase();
      if (bookingType && bookingType !== 'bnb') continue;
      const mk = monthKey(b?.checkIn || b?.eventDate || b?.createdAt);
      if (!monthSet.has(mk)) continue;
      const amountRaw = Number(
        b?.totalAmount ??
        b?.total ??
        b?.receivedAmount ??
        b?.amount ??
        b?.grossAmount ??
        b?.pricePerNight ??
        b?.price ??
        0
      );
      const amount = Number.isFinite(amountRaw) ? amountRaw : 0;

      const rawName = String(b?.roomName ?? b?.room?.name ?? b?.propertyName ?? '').trim().toLowerCase();
      const matched = stayDefs.find((s) => rawName && s.aliases.includes(rawName));
      const group = matched ? ensure(matched.key, matched.name) : ensure(unknownKey, 'Unmapped stay');

      group.totalRevenue += amount;
      group.bookingCount += 1;
      group.monthsBooked.add(mk);
      group.monthlyRevenue.set(mk, (group.monthlyRevenue.get(mk) || 0) + amount);
    }

    const rows = Array.from(byStay.values())
      .map((s) => {
        const monthly = monthKeys.map((mk) => Number(s.monthlyRevenue.get(mk) || 0));
        return {
          ...s,
          monthly,
          unbookedMonths: Math.max(0, monthKeys.length - s.monthsBooked.size),
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const maxRevenue = Math.max(1, ...rows.map((r) => r.totalRevenue));
    return { monthKeys, rows, maxRevenue };
  }, [showBnbInsights, dashboardBookings, revenueMonths, selectedAnchorDate]);

  const bnbSnapshot = useMemo(() => {
    if (!showBnbInsights || !bnbPerformance) return null;
    const activeMonthKey = String(monthKey(selectedAnchorDate) || bnbPerformance.monthKeys[bnbPerformance.monthKeys.length - 1] || '');
    const trackedRows = bnbPerformance.rows.filter((r) => r.key !== 'unknown');
    const bookedCount = trackedRows.reduce((sum, r) => {
      const idx = bnbPerformance.monthKeys.indexOf(activeMonthKey);
      if (idx < 0) return sum;
      return sum + (Number(r.monthly[idx] || 0) > 0 ? 1 : 0);
    }, 0);
    const totalBnbs = FARM_STAYS.length;
    return {
      monthKey: activeMonthKey,
      monthLabel: formatMonthKeyLabel(activeMonthKey),
      bookedCount,
      totalBnbs,
      unbookedCount: Math.max(0, totalBnbs - bookedCount),
    };
  }, [showBnbInsights, bnbPerformance, selectedAnchorDate]);

  const bnbComparisonSummary = useMemo(() => {
    if (!showBnbInsights || !bnbPerformance) return null;
    const trackedRows = bnbPerformance.rows.filter((r) => r.key !== 'unknown');
    const totalBnbRevenue = trackedRows.reduce((sum, r) => sum + Number(r.totalRevenue || 0), 0);
    const eventHireRevenue = Number(ledgerForUi?.eventHire ?? 0);
    const comparisonRowsBase = trackedRows.map((r) => ({
      key: r.key,
      name: r.name,
      revenue: Number(r.totalRevenue || 0),
      bookingCount: Number(r.bookingCount || 0),
      unbookedMonths: Number(r.unbookedMonths || 0),
      occupancyPct: Math.max(0, Math.min(100, ((revenueMonths - Number(r.unbookedMonths || 0)) / Math.max(1, revenueMonths)) * 100)),
      kind: 'bnb',
    }));
    const comparisonRows = comparisonRowsBase.sort((a, b) => Number(b.occupancyPct || 0) - Number(a.occupancyPct || 0));
    const maxRevenue = Math.max(1, ...comparisonRowsBase.map((r) => r.revenue));
    const avgOccupancyPct = comparisonRowsBase.length
      ? comparisonRowsBase.reduce((sum, r) => sum + Number(r.occupancyPct || 0), 0) / comparisonRowsBase.length
      : 0;
    return {
      totalBnbRevenue,
      eventHireRevenue,
      comparisonRows,
      maxRevenue,
      avgOccupancyPct,
      top: comparisonRows[0] ?? null,
      lowest: comparisonRows[comparisonRows.length - 1] ?? null,
    };
  }, [showBnbInsights, bnbPerformance, ledgerForUi?.eventHire, revenueMonths]);

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

  const recentBookingsCard = useMemo(() => {
    const fromGuestBookings = Array.isArray(dashboardBookings)
      ? dashboardBookings
          .map((b, i) => ({
            id: b?._id ?? b?.id ?? `bk-${i}`,
            guest: b?.guestName ?? b?.guest?.name ?? b?.customerName ?? b?.name ?? 'Guest',
            room: b?.roomName ?? b?.room?.name ?? b?.propertyName ?? '—',
            checkIn: b?.checkIn ?? b?.startDate ?? b?.date ?? b?.createdAt ?? '',
            amount: b?.totalAmount ?? b?.receivedAmount ?? b?.amount ?? b?.grossAmount ?? null,
            status: String(b?.status ?? 'pending'),
          }))
          .filter((x) => x.guest && x.checkIn)
      : [];

    const rows = (fromGuestBookings.length ? fromGuestBookings : movementsToday)
      .slice()
      .sort((a, b) => new Date(b?.checkIn ?? b?.createdAt ?? 0).getTime() - new Date(a?.checkIn ?? a?.createdAt ?? 0).getTime())
      .slice(0, 4);

    if ((bnbBookingsQuery.isPending || internalBookingsQuery.isPending) && !rows.length) {
      return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Loading recent bookings…</p>;
    }

    if (!rows.length) {
      return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No recent bookings available.</p>;
    }

    return (
      <>
        {rows.map((row, i) => (
          <div
            key={row.id ?? i}
            style={{ padding: '10px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--linen)' : undefined }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{String(row.guest)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {String(row.room || '—')} · {String(row.checkIn || '').slice(0, 10) || '—'}
                  {row.amount != null ? ` · ${fmtRand(row.amount)}` : ''}
                </div>
              </div>
              <span className={String(row.status).toLowerCase().includes('cancel') ? 'badge badge-pending' : 'badge badge-confirmed'}>
                {String(row.status)}
              </span>
            </div>
          </div>
        ))}
      </>
    );
  }, [dashboardBookings, movementsToday, bnbBookingsQuery.isPending, internalBookingsQuery.isPending]);

  const adminCompiledReports = useMemo(() => {
    if (!(variant === 'finance' || variant === 'ceo')) return [];
    return readCompiledReportsFromStorage()
      .filter((row) => String(row?.generatedByRole || '').toLowerCase() === 'admin')
      .sort((a, b) => new Date(b?.generatedAt || 0).getTime() - new Date(a?.generatedAt || 0).getTime())
      .slice(0, 4);
  }, [variant]);

  const heroStats = useMemo(() => {
    if (loading) {
      return [
        { value: '—', label: variant === 'finance' ? 'Receipts MTD' : 'Occupancy' },
        { value: '—', label: variant === 'finance' ? 'Open invoices' : 'Bookings today' },
        { value: '—', label: variant === 'finance' ? 'Debtors' : 'Receipts MTD' },
      ];
    }
    if (variant === 'finance') {
      const receiptsMtd = dash?.revenueMtd ?? dash?.incomeMtd;
      return [
        { value: fmtRand(receiptsMtd), label: 'Receipts MTD' },
        { value: dash?.openInvoices != null ? String(dash.openInvoices) : '—', label: 'Open invoices' },
        { value: fmtRand(dash?.debtorsTotal), label: 'Debtors' },
      ];
    }
    const pctRaw = occupancy ? displayOccupancyPct(occupancy) : null;
    const pct = pctRaw != null ? Math.round(pctRaw) : null;
    const bookingsToday =
      operationsDashboard?.cards?.checkInsToday?.count ??
      operationsDashboard?.cards?.checkOutsToday?.count ??
      movementsToday.length;
    return [
      { value: pct != null ? `${pct}%` : '—', label: 'Occupancy' },
      { value: bookingsToday != null ? String(bookingsToday) : '—', label: 'Bookings today' },
      { value: fmtRand(dash?.incomeMtd), label: 'Receipts MTD' },
    ];
  }, [loading, variant, dash, occupancy, operationsDashboard, movementsToday]);

  const heroSubtitle = useMemo(() => {
    if (dash?.headline) return dash.headline;
    if (dash?.bookingsNote) return dash.bookingsNote;
    if (loading) return 'Loading your dashboard…';
    return 'Live figures from /api/finance/dashboard.';
  }, [dash, loading]);

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
          <div className="dashboard-period-filters">
            <label className="dashboard-period-filter">
              <span>Month</span>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={String(m.value)}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="dashboard-period-filter">
              <span>Year</span>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
            {variant === 'finance' && !isAdminContext ? (
              <>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Revenue and Expense Summary</div>
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
                    ) : revenueExpenseTrend?.series?.length ? (
                      <div className="rev-exp-wrap">
                        <div className="rev-exp-summary-line">
                          <span>Net margin {(financeChartSummary?.netMargin ?? 0).toFixed(1)}%</span>
                          <span>Income vs expense {(financeChartSummary?.incomeVsExpenses ?? 0).toFixed(1)}%</span>
                        </div>
                        <div className="rev-exp-panel">
                          <div className="rev-exp-yaxis">
                            {revenueExpTicks.map((tick, i) => (
                              <span key={`rev-tick-${i}`} className="rev-exp-ylabel">
                                {fmtRandCompact(tick)}
                              </span>
                            ))}
                          </div>
                          <div className="rev-exp-bars">
                            {revenueExpenseTrend.series.map((p, i) => {
                              const incomePct = ((Math.max(0, Number(p?.inflow ?? 0)) / revenueExpenseTrend.maxSeries) * 100) || 0;
                              const expensePct = ((Math.max(0, Math.abs(Number(p?.outflow ?? 0))) / revenueExpenseTrend.maxSeries) * 100) || 0;
                              return (
                                <div className="rev-exp-col" key={`rv-${p.label}-${i}`}>
                                  <div className="rev-exp-track">
                                    <div className="rev-exp-bar rev-exp-bar--income" style={{ height: `${incomePct}%` }} />
                                    <div className="rev-exp-bar rev-exp-bar--expense" style={{ height: `${expensePct}%` }} />
                                  </div>
                                  <div className="rev-exp-label">{String(p.label).slice(0, 3)}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="rev-exp-legend">
                          <span><i className="fas fa-square rev-exp-dot rev-exp-dot--income" /> Revenue</span>
                          <span><i className="fas fa-square rev-exp-dot rev-exp-dot--expense" /> Expenses</span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                        No monthly cashflow series in the dashboard response for this range.
                      </p>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Cash Flow Trend</div>
                  </div>
                  <div className="card-body">
                    {loading ? (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Loading chart…</p>
                    ) : cashTrend?.labels?.length ? (
                      <div className="line-chart-wrap">
                        <div className="line-chart-panel">
                          <div className="line-chart-yaxis">
                            {cashTrend.yTicks?.map((tick, i) => (
                              <span key={`tick-${i}`} className="line-chart-ylabel">
                                {fmtRandCompact(tick)}
                              </span>
                            ))}
                          </div>
                          <div className="line-chart-canvas">
                            <svg viewBox="0 0 100 100" className="line-chart-svg" aria-label="Cash flow trend">
                              {[0, 1, 2, 3, 4].map((i) => {
                                const y = (cashTrend.yMin ?? 12) + (((cashTrend.yMax ?? 88) - (cashTrend.yMin ?? 12)) * i) / 4;
                                return (
                                  <line key={`y-${i}`} x1={cashTrend.xMin ?? 8} y1={y} x2={cashTrend.xMax ?? 92} y2={y} className="line-chart-guide" />
                                );
                              })}
                              {cashTrend.xGuides?.map((x, i) => (
                                <line
                                  key={`x-${i}`}
                                  x1={x}
                                  y1={cashTrend.yMin ?? 12}
                                  x2={x}
                                  y2={cashTrend.yMax ?? 88}
                                  className="line-chart-guide line-chart-guide--x"
                                />
                              ))}
                              <line x1={cashTrend.xMin ?? 8} y1={cashTrend.yMid} x2={cashTrend.xMax ?? 92} y2={cashTrend.yMid} className="line-chart-zero" />
                              <line x1={cashTrend.xMin ?? 8} y1={cashTrend.yMin ?? 12} x2={cashTrend.xMin ?? 8} y2={cashTrend.yMax ?? 88} className="line-chart-axis" />
                              <line x1={cashTrend.xMin ?? 8} y1={cashTrend.yMax ?? 88} x2={cashTrend.xMax ?? 92} y2={cashTrend.yMax ?? 88} className="line-chart-axis" />
                              <polyline points={cashTrend.inflowPoints} className="line-chart-line line-chart-line--in" />
                              <polyline points={cashTrend.outflowPoints} className="line-chart-line line-chart-line--out" />
                              <polyline points={cashTrend.netPoints} className="line-chart-line line-chart-line--net" />
                              {cashTrend.inflowCoords?.map((p, i) => (
                                <circle key={`in-${i}`} cx={p.x} cy={p.y} r="1.35" className="line-chart-point line-chart-point--in">
                                  <title>{`${cashTrend.labels?.[i] ?? ''}: In ${fmtRand(cashTrend.series?.[i]?.inflow)}`}</title>
                                </circle>
                              ))}
                              {cashTrend.outflowCoords?.map((p, i) => (
                                <circle key={`out-${i}`} cx={p.x} cy={p.y} r="1.35" className="line-chart-point line-chart-point--out">
                                  <title>{`${cashTrend.labels?.[i] ?? ''}: Out ${fmtRand(Math.abs(cashTrend.series?.[i]?.outflow ?? 0))}`}</title>
                                </circle>
                              ))}
                              {cashTrend.netCoords?.map((p, i) => (
                                <circle key={`net-${i}`} cx={p.x} cy={p.y} r="1.35" className="line-chart-point line-chart-point--net">
                                  <title>{`${cashTrend.labels?.[i] ?? ''}: Net ${fmtRand(cashTrend.series?.[i]?.net)}`}</title>
                                </circle>
                              ))}
                              {cashTrend.labels?.map((label, i) => (
                                <text key={`xlabel-${i}`} x={cashTrend.xGuides?.[i] ?? 0} y="94" className="line-chart-xlabel" textAnchor="middle">
                                  {label.slice(0, 3)}
                                </text>
                              ))}
                            </svg>
                          </div>
                        </div>
                        <div className="line-chart-legend line-chart-legend--aligned">
                          <span><i className="fas fa-circle line-chart-dot line-chart-dot--in" /> Cash Inflow</span>
                          <span><i className="fas fa-circle line-chart-dot line-chart-dot--out" /> Cash Outflow</span>
                          <span><i className="fas fa-circle line-chart-dot line-chart-dot--net" /> Net Cash Flow</span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                        No monthly cashflow series in the dashboard response for this range.
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.chart1.footerLeft}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{chartFooterRight}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
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
                    ) : revenueExpenseTrend?.labels?.length ? (
                      <div className="line-chart-wrap">
                        <div className="line-chart-panel">
                          <div className="line-chart-yaxis">
                            {revenueExpenseTrend.yTicks?.map((tick, i) => (
                              <span key={`tick-${i}`} className="line-chart-ylabel">
                                {fmtRandCompact(tick)}
                              </span>
                            ))}
                          </div>
                          <div className="line-chart-canvas">
                            <svg viewBox="0 0 100 100" className="line-chart-svg" aria-label="Revenue trend">
                              {[0, 1, 2, 3, 4].map((i) => {
                                const y = (revenueExpenseTrend.yMin ?? 12) + (((revenueExpenseTrend.yMax ?? 88) - (revenueExpenseTrend.yMin ?? 12)) * i) / 4;
                                return (
                                  <line key={`y-${i}`} x1={revenueExpenseTrend.xMin ?? 8} y1={y} x2={revenueExpenseTrend.xMax ?? 92} y2={y} className="line-chart-guide" />
                                );
                              })}
                              {revenueExpenseTrend.xGuides?.map((x, i) => (
                                <line
                                  key={`x-${i}`}
                                  x1={x}
                                  y1={revenueExpenseTrend.yMin ?? 12}
                                  x2={x}
                                  y2={revenueExpenseTrend.yMax ?? 88}
                                  className="line-chart-guide line-chart-guide--x"
                                />
                              ))}
                              <line x1={revenueExpenseTrend.xMin ?? 8} y1={revenueExpenseTrend.yMid} x2={revenueExpenseTrend.xMax ?? 92} y2={revenueExpenseTrend.yMid} className="line-chart-zero" />
                              <line x1={revenueExpenseTrend.xMin ?? 8} y1={revenueExpenseTrend.yMin ?? 12} x2={revenueExpenseTrend.xMin ?? 8} y2={revenueExpenseTrend.yMax ?? 88} className="line-chart-axis" />
                              <line x1={revenueExpenseTrend.xMin ?? 8} y1={revenueExpenseTrend.yMax ?? 88} x2={revenueExpenseTrend.xMax ?? 92} y2={revenueExpenseTrend.yMax ?? 88} className="line-chart-axis" />
                              <polyline points={revenueExpenseTrend.inflowPoints} className="line-chart-line line-chart-line--in" />
                              <polyline points={revenueExpenseTrend.outflowPoints} className="line-chart-line line-chart-line--out" />
                              <polyline points={revenueExpenseTrend.netPoints} className="line-chart-line line-chart-line--net" />
                              {revenueExpenseTrend.inflowCoords?.map((p, i) => (
                                <circle key={`in-${i}`} cx={p.x} cy={p.y} r="1.35" className="line-chart-point line-chart-point--in">
                                  <title>{`${revenueExpenseTrend.labels?.[i] ?? ''}: Revenue ${fmtRand(revenueExpenseTrend.series?.[i]?.inflow)}`}</title>
                                </circle>
                              ))}
                              {revenueExpenseTrend.outflowCoords?.map((p, i) => (
                                <circle key={`out-${i}`} cx={p.x} cy={p.y} r="1.35" className="line-chart-point line-chart-point--out">
                                  <title>{`${revenueExpenseTrend.labels?.[i] ?? ''}: Expenses ${fmtRand(Math.abs(revenueExpenseTrend.series?.[i]?.outflow ?? 0))}`}</title>
                                </circle>
                              ))}
                              {revenueExpenseTrend.netCoords?.map((p, i) => (
                                <circle key={`net-${i}`} cx={p.x} cy={p.y} r="1.35" className="line-chart-point line-chart-point--net">
                                  <title>{`${revenueExpenseTrend.labels?.[i] ?? ''}: Net ${fmtRand(revenueExpenseTrend.series?.[i]?.net)}`}</title>
                                </circle>
                              ))}
                              {revenueExpenseTrend.labels?.map((label, i) => (
                                <text key={`xlabel-${i}`} x={revenueExpenseTrend.xGuides?.[i] ?? 0} y="94" className="line-chart-xlabel" textAnchor="middle">
                                  {label.slice(0, 3)}
                                </text>
                              ))}
                            </svg>
                          </div>
                        </div>
                        <div className="line-chart-legend line-chart-legend--aligned">
                          <span><i className="fas fa-circle line-chart-dot line-chart-dot--in" /> Revenue</span>
                          <span><i className="fas fa-circle line-chart-dot line-chart-dot--out" /> Expenses</span>
                          <span><i className="fas fa-circle line-chart-dot line-chart-dot--net" /> Net</span>
                        </div>
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
              </>
            )}
          </div>

          {showBnbInsights ? (
            <div className="card finance-bnb-performance-card">
              <div className="card-header">
                <div>
                  <div className="card-title">{isAdminContext ? 'Property & BnB Performance' : 'BnB Revenue & Bookings by Month'}</div>
                  <div className="bnb-perf-subtitle">Period: {revenueMonths} months ending {formatMonthKeyLabel(monthKey(selectedAnchorDate))}</div>
                </div>
              </div>
              <div className="card-body">
                {(bnbBookingsQuery.isPending || internalBookingsQuery.isPending) ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    Loading BnB performance…
                  </p>
                ) : bnbComparisonSummary ? (
                  <div className="bnb-perf-wrap">
                    <div className="bnb-perf-help">
                      Bars show occupancy coverage for each stay (months with bookings in this selected period).
                    </div>
                    <div className="bnb-perf-summary-grid">
                      <div className="bnb-perf-summary">
                        <span className="bnb-perf-summary-label">BnB Revenue ({revenueMonths}M)</span>
                        <strong>{fmtRandCompact(bnbComparisonSummary.totalBnbRevenue)}</strong>
                      </div>
                      {variant === 'finance' && !isAdminContext ? (
                        <div className="bnb-perf-summary">
                          <span className="bnb-perf-summary-label">Event Hire (current month)</span>
                          <strong>{fmtRandCompact(bnbComparisonSummary.eventHireRevenue)}</strong>
                        </div>
                      ) : (
                        <div className="bnb-perf-summary">
                          <span className="bnb-perf-summary-label">Average occupancy ({revenueMonths}M)</span>
                          <strong>{`${Math.round(Number(bnbComparisonSummary.avgOccupancyPct || 0))}%`}</strong>
                        </div>
                      )}
                      <div className="bnb-perf-summary">
                        <span className="bnb-perf-summary-label">Top performer</span>
                        <strong>{bnbComparisonSummary.top?.name ?? '—'}</strong>
                      </div>
                      <div className="bnb-perf-summary">
                        <span className="bnb-perf-summary-label">Lowest performer</span>
                        <strong>{bnbComparisonSummary.lowest?.name ?? '—'}</strong>
                      </div>
                    </div>

                    {bnbComparisonSummary.comparisonRows.map((row) => {
                      const widthPct = Number(row.occupancyPct || 0);
                      const isTop = row.key === bnbComparisonSummary.top?.key;
                      const isLow = row.key === bnbComparisonSummary.lowest?.key;
                      return (
                        <div className="bnb-perf-row bnb-perf-row--comparison" key={row.key}>
                          <div className="bnb-perf-head">
                            <span className="bnb-perf-name">
                              {row.name}
                              {isTop ? <span className="bnb-perf-rank bnb-perf-rank--top">Top</span> : null}
                              {isLow ? <span className="bnb-perf-rank bnb-perf-rank--low">Low</span> : null}
                            </span>
                            <span className="bnb-perf-meta">
                              {fmtRandCompact(row.revenue)}
                              {` · ${Math.round(Number(row.occupancyPct || 0))}% occupancy coverage · ${row.bookingCount} booking${row.bookingCount === 1 ? '' : 's'} in ${revenueMonths}M`}
                            </span>
                          </div>
                          <div className="bnb-perf-compare-track">
                            <span
                              className="bnb-perf-compare-fill"
                              style={{ width: `${Math.max(0, Math.min(100, widthPct))}%` }}
                              title={`${row.name} · ${fmtRand(row.revenue)}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    No BnB comparison data yet.
                  </p>
                )}
              </div>
            </div>
          ) : null}

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
              {showBnbInsights && bnbSnapshot ? (
                <div className="ledger-bnb-booking-strip">
                  <span className="ledger-bnb-pill">
                    Active stays this month: {bnbSnapshot.bookedCount}/{bnbSnapshot.totalBnbs} ({bnbSnapshot.monthLabel})
                  </span>
                  <span className="ledger-bnb-pill ledger-bnb-pill--muted">
                    No booking this month: {bnbSnapshot.unbookedCount}/{bnbSnapshot.totalBnbs}
                  </span>
                </div>
              ) : null}
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
              <div className="card-title">Recent bookings</div>
            </div>
            <div className="card-body">{recentBookingsCard}</div>
          </div>

          {(variant === 'finance' || variant === 'ceo') ? (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Admin compiled reports</div>
                <Link to={to('reports')} className="btn btn-outline btn-sm">
                  Open reports
                </Link>
              </div>
              <div className="card-body">
                {adminCompiledReports.length ? (
                  <div className="timeline">
                    {adminCompiledReports.map((row, idx) => (
                      <div className="timeline-item" key={String(row?.id || row?.generatedAt || `${row?.title || 'report'}-${idx}`)}>
                        <div className="timeline-dot gold" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{String(row?.title || 'Compiled report')}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {String(row?.periodLabel || 'Period')} · {String(row?.generatedAt || '').slice(0, 10)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    No admin-compiled reports available yet.
                  </p>
                )}
              </div>
            </div>
          ) : null}
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
              <Link to="/finance/staff" className="btn btn-outline btn-sm">
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
          to: 'payments',
          label: 'Payments',
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
