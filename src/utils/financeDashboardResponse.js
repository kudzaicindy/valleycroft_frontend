import { unwrapApiBody } from '@/utils/apiEnvelope';

function firstNum(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function firstStr(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** Merge shallow KPI buckets (legacy + new API). */
function mergeKpiSources(root) {
  if (!root || typeof root !== 'object') return {};
  const buckets = [
    root,
    root.summary,
    root.kpis,
    root.kpi,
    root.mtd,
    root.monthToDate,
    root.snapshot,
  ].filter((b) => b && typeof b === 'object' && !Array.isArray(b));
  return Object.assign({}, ...buckets);
}

function humanizeKey(k) {
  if (!k || typeof k !== 'string') return '';
  const spaced = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
}

/**
 * Turn a controlCentre.tiles slot (number or rich object) into display parts.
 * @param {string} key
 * @param {unknown} val
 * @returns {{ key: string, title: string, primary: string, lines: string[] } | null}
 */
export function formatControlCentreTile(key, val) {
  if (val == null) return null;

  if (typeof val === 'number' && Number.isFinite(val)) {
    return {
      key,
      title: humanizeKey(key),
      primary: fmtRand(val),
      lines: [],
    };
  }

  if (typeof val === 'string' || typeof val === 'boolean') {
    return {
      key,
      title: humanizeKey(key),
      primary: String(val),
      lines: [],
    };
  }

  if (typeof val === 'object' && !Array.isArray(val)) {
    const o = val;
    const title = firstStr(o, ['label', 'title']) || humanizeKey(key);
    let primary = '—';
    const amt = firstNum(o, ['amount', 'value', 'total', 'balance']);
    const cnt = firstNum(o, ['count', 'openCount', 'scheduledCount']);
    if (amt != null) primary = fmtRand(amt);
    else if (cnt != null) primary = String(Math.round(cnt));
    else if (o.primary != null) primary = String(o.primary);

    const lines = [];
    const pct = firstNum(o, ['pct', 'percent', 'vsPriorPct', 'changePct']);
    if (pct != null) lines.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs prior`);
    if (o.onTrack != null) lines.push(o.onTrack ? 'On track' : 'Review');
    const note = firstStr(o, ['note', 'subtitle', 'hint']);
    if (note) lines.push(note);
    if (o.debtorsCurrentPct != null && Number.isFinite(Number(o.debtorsCurrentPct))) {
      lines.push(`${Number(o.debtorsCurrentPct).toFixed(0)}% current`);
    }
    return { key, title, primary, lines };
  }

  return {
    key,
    title: humanizeKey(key),
    primary: String(val),
    lines: [],
  };
}

/**
 * Normalise `controlCentre.tiles` object to an ordered list for rendering.
 * @param {Record<string, unknown>|undefined} tiles
 */
export function tilesToList(tiles) {
  if (!tiles || typeof tiles !== 'object' || Array.isArray(tiles)) return [];
  const preferred = [
    'receiptsMtd',
    'openInvoices',
    'dueThisWeek',
    'postedLines',
    'collectionsMtd',
    'debtors',
    'debtorsAging',
    'supplierPayables',
    'payables',
  ];
  const keys = new Set(Object.keys(tiles));
  const ordered = [];
  for (const k of preferred) {
    if (keys.has(k)) {
      const slot = formatControlCentreTile(k, tiles[k]);
      if (slot) ordered.push(slot);
      keys.delete(k);
    }
  }
  for (const k of Array.from(keys).sort()) {
    // Some server payloads include helper fields like exported statement labels.
    // These shouldn't render as dashboard KPI tiles.
    if (k && typeof k === 'string' && k.toLowerCase().includes('export')) continue;
    const slot = formatControlCentreTile(k, tiles[k]);
    if (slot) ordered.push(slot);
  }
  return ordered;
}

/**
 * Best-effort parse of GET /api/finance/dashboard (legacy + controlCentre layout).
 * Keeps backward-compatible scalar fields; adds `controlCentre`, `paymentQueue`, `tilesList`, etc.
 */
export function normalizeFinanceDashboardResponse(payload) {
  const body = unwrapApiBody(payload) ?? payload;
  const root =
    body && typeof body === 'object' && body.data != null && typeof body.data === 'object' && !Array.isArray(body.data)
      ? body.data
      : body;

  if (!root || typeof root !== 'object') {
    return {
      incomeMtd: null,
      expenseMtd: null,
      netMtd: null,
      priorIncomeMtd: null,
      priorExpenseMtd: null,
      debtorsTotal: null,
      invoicesDue: null,
      bookingsNote: '',
      activity: [],
      periodLabel: '',
      controlCentre: null,
      kpis: {},
      paymentQueue: [],
      tilesList: [],
      sectionKeys: {},
      revenueChartOptions: null,
      activityToday: [],
      deadlines: [],
      activityIsToday: false,
      raw: body,
    };
  }

  const cc = root.controlCentre && typeof root.controlCentre === 'object' ? root.controlCentre : null;
  const m = mergeKpiSources(root);
  const kpis = root.kpis && typeof root.kpis === 'object' ? root.kpis : {};

  const tilesSrc = (cc && cc.tiles) || kpis.tiles || {};
  const tilesList = tilesToList(typeof tilesSrc === 'object' && !Array.isArray(tilesSrc) ? tilesSrc : {});

  const invCc = cc?.invoices && typeof cc.invoices === 'object' ? cc.invoices : {};
  const invK = m;
  const openInvoices = firstNum(invCc, ['openInvoicesCount']) ?? firstNum(invK, ['openInvoicesCount', 'openInvoices']);
  const dueWeekCount = firstNum(invCc, ['dueThisWeekCount']) ?? firstNum(invK, ['dueThisWeekCount']);
  const overdueCount = firstNum(invCc, ['overdueInvoicesCount']) ?? firstNum(invK, ['overdueInvoicesCount']);

  const revenueMtd =
    firstNum(kpis, ['revenueMtd', 'revenue_mtd']) ??
    firstNum(m, ['revenueMtd', 'revenue_mtd']);
  const incomeMtdRaw =
    firstNum(kpis, ['receiptsMtd', 'incomeMtd', 'revenueMtd']) ??
    firstNum(m, ['receiptsMtd', 'incomeMtd', 'revenueMtd', 'income_mtd', 'revenue_mtd', 'totalIncomeMtd']);
  // Receipts MTD should mirror Revenue when revenue is provided by API.
  const incomeMtd = revenueMtd ?? incomeMtdRaw;
  const expenseMtd = firstNum(m, ['expenseMtd', 'expense_mtd', 'totalExpenseMtd', 'expensesMtd', 'expenseMonth']);
  const apiNetMtd = firstNum(m, ['netMtd', 'net_mtd', 'netIncomeMtd', 'profitMtd', 'netMonth']);
  /** When both MTD legs exist, derive net from them so UI matches receipts − expenses (API `netMtd` is often accrual or stale). */
  let netMtd =
    incomeMtd != null && expenseMtd != null ? incomeMtd - expenseMtd : apiNetMtd != null ? apiNetMtd : null;

  const priorIncomeMtd = firstNum(m, [
    'priorIncomeMtd',
    'prior_income_mtd',
    'incomePriorMonth',
    'revenuePriorMonth',
    'incomeMtdPrior',
  ]);
  const priorExpenseMtd = firstNum(m, ['priorExpenseMtd', 'prior_expense_mtd', 'expensePriorMonth']);

  const debtorsBlock = root.debtors ?? root.debtorAging ?? root.arAging ?? {};
  const debtorsTotal =
    firstNum(kpis, ['debtorsTotal', 'debtorsOutstanding']) ??
    firstNum(typeof debtorsBlock === 'object' ? debtorsBlock : {}, ['total', 'totalOutstanding', 'balance', 'amount']);

  const invoicesDue =
    openInvoices ??
    firstNum(invCc, ['dueCount', 'pendingCount']) ??
    firstNum(typeof root.invoices === 'object' ? root.invoices : {}, ['dueCount', 'overdueCount', 'due', 'pending']);

  const book = root.bookings ?? root.bookingSnapshot ?? {};
  const bookingsNoteRaw = firstStr(typeof book === 'object' ? book : root, ['summary', 'headline', 'note', 'message']);

  const activityToday = Array.isArray(root.activityToday) ? root.activityToday : [];
  const activityIsToday = activityToday.length > 0;
  let activity = activityIsToday ? activityToday : root.activity ?? root.recentActivity ?? root.feed ?? [];
  if (!Array.isArray(activity)) activity = [];

  const deadlines = Array.isArray(root.deadlines) ? root.deadlines : [];

  let paymentQueue = Array.isArray(root.paymentQueue) ? root.paymentQueue : [];
  if (!paymentQueue.length && Array.isArray(root.invoicesDueAndRecent)) {
    paymentQueue = root.invoicesDueAndRecent;
  }

  const periodLabel =
    firstStr(kpis, ['periodLabel', 'period', 'asOf', 'as_of', 'monthLabel']) ||
    firstStr(m, ['periodLabel', 'period', 'asOf', 'as_of', 'monthLabel']) ||
    firstStr(root, ['periodLabel', 'asOf']);

  let headline = firstStr(cc || {}, ['headline']) || firstStr(kpis, ['headline']);
  if (!headline && !cc && bookingsNoteRaw) headline = bookingsNoteRaw;

  const bookingsNote =
    cc && cc.headline
      ? ''
      : headline && headline === bookingsNoteRaw
        ? ''
        : bookingsNoteRaw;

  return {
    incomeMtd,
    revenueMtd,
    expenseMtd,
    netMtd,
    priorIncomeMtd,
    priorExpenseMtd,
    debtorsTotal,
    invoicesDue,
    openInvoices,
    dueWeekCount,
    overdueCount,
    bookingsNote: cc?.headline ? '' : bookingsNote,
    activity,
    periodLabel,
    headline,
    controlCentre: cc,
    kpis,
    paymentQueue,
    tilesList,
    sectionKeys: (cc && cc.sectionKeys) || {},
    revenueChartOptions: (cc && cc.revenueChartOptions) || null,
    activityToday,
    deadlines,
    activityIsToday,
    raw: root,
  };
}

export function fmtRand(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return (
    'R ' +
    Number(n).toLocaleString('en-ZA', {
      maximumFractionDigits: 0,
    })
  );
}

/**
 * Map API quick-link href to a path that works for the current app shell (finance vs ceo vs admin).
 * @param {string} href
 * @param {string} basePath e.g. `/finance`
 */
export function mapFinanceQuickLinkHref(href, basePath) {
  if (!href || typeof href !== 'string') return href;
  if (!href.startsWith('/')) return href;
  const prefixes = ['/finance', '/ceo', '/admin'];
  for (const p of prefixes) {
    if (href === p || href.startsWith(p + '/')) {
      const rest = href.slice(p.length) || '/';
      return `${basePath}${rest === '/' ? '' : rest}`;
    }
  }
  return href;
}
