import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { compileAiReport, listSavedAiReports, deleteSavedAiReport } from '@/api/reports';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { marked } from 'marked';

marked.use({
  gfm: true,
  breaks: true,
});

const STORAGE_KEY = 'valleycroft_compiled_reports_v1';
const PERIOD_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

/** AI provider for compile POST and optional PDF query (backend). */
const AI_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto (OpenAI → OpenRouter → Gemini)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'gemini', label: 'Gemini' },
];

function parseMonthKey(monthKey) {
  const m = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function toIsoDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fmtRand(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R0';
  return `R ${Math.round(n).toLocaleString('en-ZA')}`;
}

function fmtCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '').trim() || '—';
  return Math.round(n).toLocaleString('en-ZA');
}

function fmtPercentDisplay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`;
}

/** Table cell: ISO-ish dates → short local; otherwise escaped as-is. */
function fmtReportCellDate(value) {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return escapeHtml(d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }));
  }
  return escapeHtml(String(value));
}

function fmtStockQty(value) {
  if (value === '' || value == null) return '—';
  const n = Number(value);
  if (Number.isFinite(n)) return escapeHtml(fmtCount(n));
  return escapeHtml(String(value));
}

/** Trusted markdown from API → HTML for report preview/PDF (same pipeline). */
function reportMarkdownToHtml(md) {
  const s = String(md || '').trim();
  if (!s) return '';
  try {
    return marked.parse(s, { async: false });
  } catch {
    return `<p>${escapeHtml(s)}</p>`;
  }
}

function fmtDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function periodRange(period, monthKey) {
  const anchor = parseMonthKey(monthKey) || new Date();
  const end = monthKey
    ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999)
    : new Date();
  const start = new Date(end);
  if (period === 'weekly') {
    start.setDate(end.getDate() - 6);
  } else if (period === 'monthly') {
    start.setDate(1);
  } else if (period === 'quarterly') {
    const qStartMonth = end.getMonth() - 2;
    start.setFullYear(end.getFullYear(), qStartMonth, 1);
  } else {
    start.setFullYear(end.getFullYear(), 0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function readStoredReports() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

/** Normalise list payload from GET saved-reports endpoints. */
function extractSavedReportsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.reports)) return payload.reports;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (payload.data && typeof payload.data === 'object' && Array.isArray(payload.data.data)) return payload.data.data;
  if (payload.data && typeof payload.data === 'object' && (payload.data._id || payload.data.id)) return [payload.data];
  if ((payload._id || payload.id) && (payload.insight != null || payload.summary != null)) return [payload];
  return [];
}

/** Map a DB report document into the same row shape used by the reports table / PDF preview. */
function savedDbReportToUiRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw?._id ?? raw?.id ?? raw?.reportId ?? raw?.data?.reportId ?? '').trim();
  if (!id) return null;

  const period = String(raw?.period ?? raw?.data?.period ?? raw?.reportPeriod ?? 'monthly').toLowerCase();
  const generatedByRole = String(raw?.generatedByRole ?? raw?.createdByRole ?? raw?.authorRole ?? 'admin').toLowerCase();
  const genRaw = raw?.generatedAt ?? raw?.createdAt ?? raw?.updatedAt;
  const generatedAt =
    genRaw == null
      ? new Date().toISOString()
      : typeof genRaw === 'string'
        ? genRaw
        : new Date(genRaw).toISOString();

  const norm = normalizeInsight({ insight: raw?.insight ?? raw?.data?.insight, reportId: id, data: raw });
  const summary = norm?.summary ?? String(raw?.summary || '');
  const drTitle = String(raw?.data?.insight?.detailedReport?.title || '').trim();
  const rangeStart = raw?.data?.dateRange?.start;
  const monthKeyFromRange =
    rangeStart && (typeof rangeStart === 'string' || rangeStart instanceof Date)
      ? toIsoDate(rangeStart).slice(0, 7)
      : '';
  const monthKey = String(raw?.monthKey || '').trim() || monthKeyFromRange || toIsoDate(generatedAt).slice(0, 7);
  const periodLabel =
    String(raw?.periodLabel || '').trim()
    || (raw?.data?.dateRange?.start && raw?.data?.dateRange?.end
      ? `${toIsoDate(raw.data.dateRange.start)} – ${toIsoDate(raw.data.dateRange.end)}`
      : '')
    || reportPeriodLabel(period, periodRange(period, monthKey));
  const title = String(raw?.title || '').trim() || drTitle || periodTitle(period);

  const ft = raw.financeTruth ?? raw.data?.financeTruth;
  const dbDetail = raw.dbDetail ?? raw.data?.dbDetail;

  const emptyMetrics = {
    revenue: 0,
    expenses: 0,
    net: 0,
    recognizedRevenue: 0,
    paymentsCollected: 0,
    netRecognized: 0,
    incomeTransactionsTotal: 0,
    bookingsCount: 0,
    bnbRevenue: 0,
    eventRevenue: 0,
    occupancyPct: 0,
    stockAlerts: 0,
    invoicesCount: 0,
    invoicedAmount: 0,
    debtorsTotal: 0,
    suppliersCount: 0,
    salaryCount: 0,
    salaryTotal: 0,
    stockItems: 0,
  };
  const emptyDetail = {
    periodStart: '',
    periodEnd: '',
    transactionsByCategory: [],
    topBookings: [],
    topInvoices: [],
    lowStockItems: [],
    recentActivity: [],
  };

  const baseMetrics = {
    ...emptyMetrics,
    ...(raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {}),
    ...(raw.data?.metrics && typeof raw.data.metrics === 'object' ? raw.data.metrics : {}),
  };
  const dm = raw.data?.metrics && typeof raw.data.metrics === 'object' ? raw.data.metrics : null;
  if (dm) {
    Object.assign(baseMetrics, {
      bookingsCount: Number(dm.bookingsAll ?? dm.bookingsCount ?? baseMetrics.bookingsCount),
      bnbRevenue: Number(dm.bnbRevenueTxn ?? dm.bnbRevenue ?? baseMetrics.bnbRevenue),
      eventRevenue: Number(dm.eventRevenueTxn ?? dm.eventRevenue ?? baseMetrics.eventRevenue),
      occupancyPct: Number(dm.occupancyPct ?? baseMetrics.occupancyPct),
      stockAlerts: Number(dm.stockAlerts ?? baseMetrics.stockAlerts),
    });
  }
  if (ft && typeof ft === 'object') {
    const recognized = Number(ft.recognizedRevenue ?? 0);
    const payments = Number(ft.paymentsCollected ?? 0);
    const exp = Number(ft.expenses ?? 0);
    const netRec = Number(ft.netRecognized ?? 0);
    const incTx = Number(ft.incomeTransactionsTotal ?? 0);
    Object.assign(baseMetrics, {
      recognizedRevenue: recognized,
      revenue: recognized,
      paymentsCollected: payments,
      expenses: exp,
      netRecognized: netRec,
      net: netRec,
      incomeTransactionsTotal: incTx,
    });
  }

  const mergedDetail = {
    ...emptyDetail,
    ...(typeof dbDetail === 'object' && dbDetail ? dbDetail : {}),
    ...(raw.detail && typeof raw.detail === 'object' ? raw.detail : {}),
  };

  return {
    id: `api-${id}`,
    reportDbId: id,
    data: raw.data && typeof raw.data === 'object' ? raw.data : null,
    financeTruth: ft && typeof ft === 'object' ? ft : null,
    dbDetail: dbDetail && typeof dbDetail === 'object' ? dbDetail : null,
    title,
    period,
    periodLabel,
    monthKey,
    generatedAt,
    generatedByRole,
    summary,
    insight: norm
      ? {
          summary: norm.summary,
          highlights: Array.isArray(norm.highlights) ? norm.highlights : [],
          risks: Array.isArray(norm.risks) ? norm.risks : [],
          actions: Array.isArray(norm.actions) ? norm.actions : [],
          mode: pickRowInsightMode(raw) || norm.modeRaw || norm.mode || 'fallback',
          modeLabel: String(norm.modeLabel || pickRowInsightModeLabel(raw) || '').trim(),
          detailedReport:
            norm.detailedReport && typeof norm.detailedReport === 'object'
              ? norm.detailedReport
              : null,
        }
      : null,
    metrics: baseMetrics,
    detail: mergedDetail,
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turn `detailedReport` object keys into short section titles. */
function humanizeReportKey(key) {
  const k = String(key || '').replace(/_/g, ' ');
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatInsightListLine(item) {
  if (item != null && typeof item === 'object') {
    const t = item.text ?? item.body ?? item.summary ?? item.label ?? item.title;
    if (t != null && String(t).trim()) return String(t).trim();
    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }
  return String(item ?? '');
}

/**
 * API `detailedReport` often uses parallel keys `sections` / `actions` / `detail`.
 * Rendering each as its own `<h3>` stacks three one-word headings on separate lines.
 * Merge string-only siblings into one markdown flow with run-in labels instead.
 */
const DETAIL_RUNIN_MERGE_KEYS = ['sections', 'actions', 'detail'];

function tryMergedDetailRunInHtml(dr, depth) {
  if (depth !== 0 || !dr || typeof dr !== 'object' || Array.isArray(dr)) return '';
  const keys = sortDetailedReportKeys(
    Object.keys(dr).filter((k) => k && !String(k).startsWith('_')),
    0,
  );
  const skipMeta = new Set(['title', 'generatedAt']);
  const meaningful = keys.filter((k) => !skipMeta.has(k) && dr[k] != null && dr[k] !== '');
  if (meaningful.length < 2) return '';
  if (!meaningful.every((k) => DETAIL_RUNIN_MERGE_KEYS.includes(k))) return '';
  if (!meaningful.every((k) => typeof dr[k] === 'string')) return '';
  const ordered = DETAIL_RUNIN_MERGE_KEYS.filter((k) => meaningful.includes(k));
  const parts = ordered
    .map((k) => {
      const raw = String(dr[k] || '').trim();
      if (!raw) return '';
      return `**${humanizeReportKey(k)}.** ${raw}`;
    })
    .filter(Boolean);
  if (parts.length < 2) return '';
  const md = parts.join('\n\n');
  return `<div class="markdown-body detail-runin">${reportMarkdownToHtml(md)}</div>`;
}

function detailedReportSectionsHtml(dr, depth = 0) {
  if (dr == null) return '';
  if (typeof dr === 'string') {
    const trimmed = dr.trim();
    if (!trimmed) return '';
    return `<div class="markdown-body">${reportMarkdownToHtml(trimmed)}</div>`;
  }
  if (Array.isArray(dr)) {
    if (!dr.length) return '';
    return `<ul class="detail-ul">${dr
      .map((item) => {
        if (item != null && typeof item === 'object' && !Array.isArray(item)) {
          return `<li class="detail-li">${detailedReportSectionsHtml(item, depth + 1)}</li>`;
        }
        return `<li class="detail-li">${escapeHtml(formatInsightListLine(item))}</li>`;
      })
      .join('')}</ul>`;
  }
  if (typeof dr !== 'object') return `<p>${escapeHtml(String(dr))}</p>`;
  const mergedRunIn = tryMergedDetailRunInHtml(dr, depth);
  if (mergedRunIn) return mergedRunIn;
  const keys = sortDetailedReportKeys(Object.keys(dr), depth);
  const entries = keys.map((k) => [k, dr[k]]).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  if (depth > 5) return '<p class="meta">…</p>';
  return entries
    .map(([k, v]) => {
      const title = humanizeReportKey(k);
      if (typeof v === 'string') {
        const inner = reportMarkdownToHtml(v);
        return `<h3 class="detail-h3">${escapeHtml(title)}</h3><div class="markdown-body">${inner || `<p>${escapeHtml(v)}</p>`}</div>`;
      }
      if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
        return `<h3 class="detail-h3">${escapeHtml(title)}</h3>${detailedReportSectionsHtml(v, depth + 1)}`;
      }
      return `<h3 class="detail-h3">${escapeHtml(title)}</h3><p>${escapeHtml(String(v))}</p>`;
    })
    .join('');
}

function insightBulletListHtml(items) {
  if (!Array.isArray(items) || !items.length) return '<span class="cell-empty">—</span>';
  const li = items.map((item) => `<li>${escapeHtml(formatInsightListLine(item))}</li>`);
  return `<ul class="insight-ul">${li.join('')}</ul>`;
}

function reportPeriodLabel(period, range) {
  if (period === 'weekly') {
    return `${range.start.toLocaleDateString('en-ZA')} - ${range.end.toLocaleDateString('en-ZA')}`;
  }
  if (period === 'monthly') {
    return range.end.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  }
  if (period === 'quarterly') {
    return `Quarter ending ${range.end.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`;
  }
  return `${range.end.getFullYear()} Year-to-date`;
}

function pickFinanceTruth(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const ft = obj.financeTruth ?? obj.data?.financeTruth;
  return ft && typeof ft === 'object' ? ft : null;
}

/** Preferred key order for backend `detailedReport` objects (depth 0 only). */
const DETAILED_REPORT_KEY_ORDER = [
  'title',
  'executiveSummary',
  'summary',
  'sections',
  'forecast',
  'generatedAt',
];

function sortDetailedReportKeys(keys, depth) {
  const filtered = [...keys].filter((k) => k && !String(k).startsWith('_'));
  if (depth > 0) return filtered.sort((a, b) => a.localeCompare(b));
  return filtered.sort((a, b) => {
    const ia = DETAILED_REPORT_KEY_ORDER.indexOf(a);
    const ib = DETAILED_REPORT_KEY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function pickDbDetail(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const d = obj.dbDetail ?? obj.data?.dbDetail;
  if (d && typeof d === 'object') return d;
  const det = obj.detail;
  if (
    det && typeof det === 'object'
    && (det.coverage || det.transactionCategoryBreakdown || det.topBookings || det.invoiceFocus)
  ) {
    return det;
  }
  return null;
}

function formatInsightModeLabel(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === 'openai_db_grounded' || m === 'ai_db_grounded') return 'AI-authored narrative (DB-grounded)';
  if (m === 'database_summary') return 'Fallback (DB summary — no AI key or AI error)';
  if (m === 'openai') return 'AI-powered';
  return 'Fallback / other';
}

/** Prefer backend `insight.modeLabel`; else map legacy `mode` slug. */
function displayInsightModeLabel(insight) {
  const ml = String(insight?.modeLabel ?? '').trim();
  if (ml) return ml;
  return formatInsightModeLabel(insight?.mode);
}

/** Mode from list row: backend often nests under `data.insight`. */
function pickRowInsightMode(row) {
  return row?.data?.insight?.mode ?? row?.insight?.mode ?? '';
}

function pickRowInsightModeLabel(row) {
  return String(row?.data?.insight?.modeLabel ?? row?.insight?.modeLabel ?? '').trim();
}

/** `reportId` from compile POST envelope (`reportId` | `data.reportId` | `meta.reportId`). */
function pickCompileReportId(res) {
  const d = res?.data;
  if (!d || typeof d !== 'object') return '';
  const inner = d.data;
  const candidates = [
    d.reportId,
    inner?.reportId,
    d.meta?.reportId,
    inner?.meta?.reportId,
  ];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** KPI numbers from financeTruth with legacy fallbacks (compiled client-side rows). */
function resolveFinanceDisplay(report) {
  const ft = pickFinanceTruth(report);
  const db = pickDbDetail(report) || {};
  const cov = db.coverage && typeof db.coverage === 'object' ? db.coverage : {};
  const gpi = cov.guestPaymentsInvoices && typeof cov.guestPaymentsInvoices === 'object' ? cov.guestPaymentsInvoices : null;
  const ds = cov.debtorsSuppliers && typeof cov.debtorsSuppliers === 'object' ? cov.debtorsSuppliers : null;
  const wp = cov.workerPayments && typeof cov.workerPayments === 'object' ? cov.workerPayments : null;
  const invCov = cov.inventory && typeof cov.inventory === 'object' ? cov.inventory : null;
  const m0 = report?.metrics && typeof report.metrics === 'object' ? { ...report.metrics } : {};
  if (gpi) {
    const ic = gpi.invoiceCount ?? gpi.count;
    const it = gpi.invoiceTotal ?? gpi.total;
    if (ic != null && ic !== '') m0.invoicesCount = Number(ic);
    if (it != null && it !== '') m0.invoicedAmount = Number(it);
  }
  if (ds) {
    if (ds.debtorsBalance != null && ds.debtorsBalance !== '') m0.debtorsTotal = Number(ds.debtorsBalance);
    if (ds.suppliersCount != null && ds.suppliersCount !== '') m0.suppliersCount = Number(ds.suppliersCount);
  }
  if (wp) {
    if (wp.salaryRecords != null && wp.salaryRecords !== '') m0.salaryCount = Number(wp.salaryRecords);
    if (wp.salaryPaid != null && wp.salaryPaid !== '') m0.salaryTotal = Number(wp.salaryPaid);
  }
  if (invCov) {
    if (invCov.itemCount != null && invCov.itemCount !== '') m0.stockItems = Number(invCov.itemCount);
    if (!Number(m0.stockAlerts) && invCov.lowStockCount != null && invCov.lowStockCount !== '') {
      m0.stockAlerts = Number(invCov.lowStockCount);
    }
  }
  const dm = report?.data?.metrics && typeof report.data.metrics === 'object' ? report.data.metrics : null;
  if (dm) {
    if (!Number(m0.bookingsCount)) m0.bookingsCount = Number(dm.bookingsAll ?? dm.bookingsCount ?? 0);
    if (!Number(m0.bnbRevenue)) m0.bnbRevenue = Number(dm.bnbRevenueTxn ?? dm.bnbRevenue ?? 0);
    if (!Number(m0.eventRevenue)) m0.eventRevenue = Number(dm.eventRevenueTxn ?? dm.eventRevenue ?? 0);
    if (!Number(m0.occupancyPct) && dm.occupancyPct != null) m0.occupancyPct = Number(dm.occupancyPct);
    if (!Number(m0.stockAlerts) && dm.stockAlerts != null) m0.stockAlerts = Number(dm.stockAlerts);
  }
  const m = m0;
  if (ft) {
    return {
      recognizedRevenue: Number(ft.recognizedRevenue ?? 0),
      paymentsCollected: Number(ft.paymentsCollected ?? 0),
      expenses: Number(ft.expenses ?? 0),
      netRecognized: Number(ft.netRecognized ?? 0),
      incomeTransactionsTotal: Number(ft.incomeTransactionsTotal ?? 0),
      bookingsCount: Number(m.bookingsCount ?? 0),
      bnbRevenue: Number(m.bnbRevenue ?? m.bnbRevenueTxn ?? 0),
      eventRevenue: Number(m.eventRevenue ?? m.eventRevenueTxn ?? 0),
      occupancyPct: Number(m.occupancyPct ?? 0),
      stockAlerts: Number(m.stockAlerts ?? 0),
      invoicesCount: Number(m.invoicesCount ?? 0),
      invoicedAmount: Number(m.invoicedAmount ?? 0),
      debtorsTotal: Number(m.debtorsTotal ?? 0),
      suppliersCount: Number(m.suppliersCount ?? 0),
      salaryCount: Number(m.salaryCount ?? 0),
      salaryTotal: Number(m.salaryTotal ?? 0),
      stockItems: Number(m.stockItems ?? 0),
    };
  }
  return {
    recognizedRevenue: Number(m.recognizedRevenue ?? m.revenue ?? 0),
    paymentsCollected: Number(m.paymentsCollected ?? 0),
    expenses: Number(m.expenses ?? 0),
    netRecognized: Number(m.netRecognized ?? m.net ?? 0),
    incomeTransactionsTotal: Number(m.incomeTransactionsTotal ?? 0),
    bookingsCount: Number(m.bookingsCount ?? 0),
    bnbRevenue: Number(m.bnbRevenue ?? m.bnbRevenueTxn ?? 0),
    eventRevenue: Number(m.eventRevenue ?? m.eventRevenueTxn ?? 0),
    occupancyPct: Number(m.occupancyPct ?? 0),
    stockAlerts: Number(m.stockAlerts ?? 0),
    invoicesCount: Number(m.invoicesCount ?? 0),
    invoicedAmount: Number(m.invoicedAmount ?? 0),
    debtorsTotal: Number(m.debtorsTotal ?? 0),
    suppliersCount: Number(m.suppliersCount ?? 0),
    salaryCount: Number(m.salaryCount ?? 0),
    salaryTotal: Number(m.salaryTotal ?? 0),
    stockItems: Number(m.stockItems ?? 0),
  };
}

function detailTableRows(report, key, ...aliases) {
  const db = pickDbDetail(report) || {};
  const leg = report?.detail || {};
  const keys = [key, ...aliases];
  for (const k of keys) {
    if (k && Array.isArray(db[k])) return db[k];
  }
  for (const k of keys) {
    if (k && Array.isArray(leg[k])) return leg[k];
  }
  return [];
}

/** Backend low-stock rows may use `item` instead of `name`. */
function normalizeLowStockRow(row) {
  if (!row || typeof row !== 'object') {
    return { name: '', category: '', quantity: '', reorderLevel: '' };
  }
  return {
    name: String(row.name ?? row.item ?? row.productName ?? '').trim(),
    category: String(row.category ?? '').trim(),
    quantity: row.quantity ?? row.qty ?? '',
    reorderLevel: row.reorderLevel ?? row.reorder ?? '',
  };
}

/** Wait for Google fonts inside srcdoc iframe so html2canvas matches Preview. */
async function waitForIframeFonts(iframeDoc) {
  if (!iframeDoc?.fonts?.load) return;
  await iframeDoc.fonts.ready.catch(() => {});
  const L = (spec) => iframeDoc.fonts.load(spec).catch(() => false);
  await Promise.all([
    L('400 14px "DM Sans"'),
    L('500 14px "DM Sans"'),
    L('600 14px "DM Sans"'),
    L('600 1.85rem Fraunces'),
    L('600 1.125rem Fraunces'),
    L('600 1.05rem Fraunces'),
  ]);
}

/** Type + category on one line for transaction breakdown (preview + PDF). */
function formatTransactionCategoryLine(row) {
  const t = String(row?.type ?? '').replace(/\s+/g, ' ').trim();
  const c = String(row?.category ?? '').replace(/\s+/g, ' ').trim();
  if (t && c) return `${t} — ${c}`;
  return t || c || '—';
}

/** Full report document for Preview iframe and PDF export (identical HTML/CSS). */
function buildReportHtml(report) {
  const fd = resolveFinanceDisplay(report);
  const generatedAt = fmtDateTime(report.generatedAt);
  const ai = report?.insight ?? null;
  const aiModeDisplay = displayInsightModeLabel(ai);
  const drHtml = ai?.detailedReport ? detailedReportSectionsHtml(ai.detailedReport) : '';
  const transactionRows = detailTableRows(report, 'transactionsByCategory', 'transactionCategoryBreakdown');
  const bookingRows = detailTableRows(report, 'topBookings', 'bookings');
  const invoiceRows = detailTableRows(report, 'topInvoices', 'invoices', 'invoiceFocus');
  const stockRows = detailTableRows(report, 'lowStockItems', 'stock').map(normalizeLowStockRow);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #14221a;
      --ink-soft: #3d5245;
      --muted: #5c6f62;
      --line: #dce5df;
      --line-strong: #c5d3c9;
      --surface: #ffffff;
      --surface-2: #f6f8f6;
      --surface-3: #eef3ef;
      --accent: #1e4d2b;
      --accent-soft: rgba(30, 77, 43, 0.1);
      --radius: 12px;
      --radius-sm: 8px;
      --shadow: 0 1px 3px rgba(20, 34, 26, 0.05);
      --prose-width: 68ch;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      font-family: "DM Sans", system-ui, -apple-system, sans-serif;
      font-size: 15px;
      line-height: 1.62;
      color: var(--ink);
      background: linear-gradient(180deg, #ebe9e4 0%, #e4e2dc 100%);
      -webkit-font-smoothing: antialiased;
    }
    .doc {
      max-width: 920px;
      margin: 28px auto 40px;
      padding: 0 20px 32px;
    }
    .sheet {
      background: var(--surface);
      border-radius: 0;
      box-shadow: var(--shadow);
      border: 1px solid var(--line-strong);
      overflow: hidden;
    }
    .doc-header {
      padding: 36px 40px 32px;
      background: var(--surface);
      border-bottom: 2px solid var(--ink);
    }
    .doc-kicker {
      margin: 0 0 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .doc-title {
      margin: 0 0 20px;
      font-family: Fraunces, Georgia, "Times New Roman", serif;
      font-size: 1.85rem;
      font-weight: 600;
      line-height: 1.2;
      color: var(--accent);
      letter-spacing: -0.02em;
    }
    .doc-meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px 32px;
      margin: 24px 0 0;
      padding: 22px 0 0;
      border-top: 1px solid var(--line);
    }
    @media (max-width: 640px) {
      .doc-meta { grid-template-columns: 1fr; }
    }
    .doc-meta > div {
      padding: 0;
      background: none;
      border: none;
      border-radius: 0;
    }
    .doc-meta dt {
      margin: 0 0 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .doc-meta dd {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
    }
    .doc-main {
      padding: 20px 44px 52px;
    }
    .section {
      margin-top: 36px;
    }
    .section:first-of-type { margin-top: 8px; }
    h2 {
      margin: 0 0 12px;
      font-family: Fraunces, Georgia, serif;
      font-size: 1.22rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      text-transform: none;
      color: var(--ink);
      padding: 0 0 12px 0;
      border-bottom: 2px solid var(--accent);
      max-width: 100%;
    }
    .prose {
      font-size: 15px;
      line-height: 1.72;
      color: var(--ink-soft);
      max-width: var(--prose-width);
    }
    .prose p { margin: 0 0 14px; }
    .prose p:last-child { margin-bottom: 0; }
    .prose.markdown-body > p:first-of-type,
    .prose:not(.markdown-body) p:first-of-type {
      font-size: 1.02rem;
      color: var(--ink);
      line-height: 1.68;
    }
    .markdown-body {
      font-size: 15px;
      line-height: 1.72;
      color: var(--ink-soft);
      max-width: var(--prose-width);
    }
    .markdown-body > *:first-child { margin-top: 0; }
    .markdown-body > *:last-child { margin-bottom: 0; }
    .markdown-body p { margin: 0 0 12px; }
    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3,
    .markdown-body h4 {
      font-family: Fraunces, Georgia, serif;
      font-weight: 600;
      color: var(--accent);
      margin: 22px 0 10px;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }
    .markdown-body h1 { font-size: 1.35rem; }
    .markdown-body h2 { font-size: 1.18rem; border-bottom: none; padding: 0; }
    .markdown-body h3 { font-size: 1.05rem; }
    .markdown-body h4 { font-size: 1rem; color: var(--ink); }
    .markdown-body ul,
    .markdown-body ol {
      margin: 0 0 12px;
      padding-left: 1.35rem;
      color: var(--ink-soft);
    }
    .markdown-body li { margin: 6px 0; }
    .markdown-body li > p { margin: 4px 0; }
    .markdown-body blockquote {
      margin: 0 0 14px;
      padding: 10px 14px 10px 16px;
      border-left: 4px solid var(--accent);
      background: var(--surface-2);
      color: var(--ink-soft);
      font-size: 14px;
    }
    .markdown-body code {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.88em;
      background: var(--surface-3);
      padding: 0.12em 0.35em;
      border-radius: 4px;
      color: var(--ink);
    }
    .markdown-body pre {
      margin: 0 0 14px;
      padding: 12px 14px;
      overflow: auto;
      font-size: 13px;
      line-height: 1.5;
      background: var(--surface-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
    }
    .markdown-body pre code { background: none; padding: 0; font-size: inherit; }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      margin: 0 0 14px;
    }
    .markdown-body th,
    .markdown-body td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    .markdown-body th {
      background: var(--surface-3);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .markdown-body hr {
      border: none;
      border-top: 1px solid var(--line-strong);
      margin: 18px 0;
    }
    .markdown-body a { color: var(--accent); text-decoration: underline; }
    .lede {
      font-size: 14px;
      line-height: 1.68;
      color: var(--ink-soft);
      margin: 0 0 18px;
      max-width: var(--prose-width);
      padding: 14px 18px 14px 20px;
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-left: 4px solid var(--accent);
    }
    .narrative {
      margin-top: 16px;
      padding: 20px 22px 22px 24px;
      border-left: 4px solid var(--accent);
      background: linear-gradient(135deg, #fafcfa 0%, #f2f7f2 100%);
      border: 1px solid var(--line);
      border-left-width: 4px;
    }
    .narrative > .table-wrap { margin-top: 22px; }
    .mode-line {
      font-size: 13px;
      margin: 0 0 14px;
      color: var(--ink-soft);
    }
    .mode-line strong { color: var(--ink); }
    .mode-slug {
      font-size: 12px;
      color: var(--muted);
      font-weight: 500;
    }
    .detailed-report { margin-top: 4px; }
    .detailed-report {
      max-width: var(--prose-width);
    }
    .detailed-report p {
      margin: 0 0 12px;
      font-size: 15px;
      line-height: 1.72;
      color: var(--ink-soft);
    }
    .detailed-report p:last-child { margin-bottom: 0; }
    .detail-h3 {
      margin: 22px 0 10px;
      font-family: Fraunces, Georgia, serif;
      font-size: 1.08rem;
      font-weight: 600;
      color: var(--accent);
      letter-spacing: -0.01em;
    }
    .detail-h3:first-child { margin-top: 0; }
    .detail-ul, .insight-ul {
      margin: 10px 0 0;
      padding-left: 1.25rem;
      color: var(--ink-soft);
      font-size: 14px;
    }
    .detail-li, .insight-ul li { margin: 8px 0; }
    .insight-ul li { line-height: 1.58; }
    .cell-empty { color: var(--muted); font-style: italic; }
    .table-wrap {
      margin-top: 12px;
      border-radius: 0;
      border: 1px solid var(--line-strong);
      border-top: 2px solid var(--ink);
      overflow: hidden;
      background: var(--surface);
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .data-table th {
      text-align: left;
      padding: 11px 14px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      background: var(--surface-3);
      border-bottom: 1px solid var(--line);
    }
    .data-table th.td-num { text-align: right; }
    .data-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      color: var(--ink-soft);
      vertical-align: top;
      line-height: 1.5;
    }
    .data-table tbody tr:nth-child(even) td { background: #fafcfb; }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table .td-num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--ink);
      font-weight: 500;
    }
    .data-table td.cell-muted {
      color: var(--muted);
      font-style: italic;
      font-size: 13px;
    }
    .data-table.financial-summary td:first-child {
      font-weight: 500;
      color: var(--ink);
      width: 58%;
    }
    /* Flex rows so Category / Count / Total stay one horizontal line in preview + PDF capture. */
    .txn-cat-list {
      border: 1px solid var(--line-strong);
      border-top: 2px solid var(--ink);
      background: var(--surface);
      overflow: hidden;
    }
    .txn-cat-head,
    .txn-cat-row {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: center;
      gap: 16px;
      padding: 11px 16px;
      border-bottom: 1px solid var(--line);
      line-height: 1.35;
    }
    .txn-cat-head {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      background: var(--surface-3);
    }
    .txn-cat-row:nth-child(even) {
      background: #fafcfb;
    }
    .txn-cat-row:last-child {
      border-bottom: none;
    }
    .txn-cat-col-cat {
      flex: 1 1 auto;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--ink-soft);
      font-size: 14px;
    }
    .txn-cat-col-num {
      flex: 0 0 7rem;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--ink);
      font-weight: 500;
      font-size: 14px;
    }
    .txn-cat-head .txn-cat-col-num {
      font-weight: 700;
      color: var(--muted);
    }
    .txn-cat-empty {
      padding: 16px;
      color: var(--muted);
      font-style: italic;
      font-size: 13px;
      border: 1px solid var(--line-strong);
      border-top: 2px solid var(--ink);
      background: var(--surface);
    }
    .scope-note {
      color: var(--muted);
      font-size: 12px;
      font-style: italic;
    }
    .doc-footer {
      margin: 40px auto 36px;
      padding: 22px 44px 0;
      border-top: 2px solid var(--line);
      font-size: 11px;
      line-height: 1.65;
      color: var(--muted);
      text-align: center;
      max-width: 52rem;
    }
    @media print {
      body { background: #fff; }
      .doc { margin: 0; max-width: none; padding: 0; }
      .sheet { box-shadow: none; border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="doc">
    <article class="sheet">
      <header class="doc-header">
        <p class="doc-kicker">Valleycroft · Business performance</p>
        <h1 class="doc-title">${escapeHtml(report.title)}</h1>
        <dl class="doc-meta">
          <div><dt>Reporting period</dt><dd>${escapeHtml(report.periodLabel)}</dd></div>
          <div><dt>Generated</dt><dd>${escapeHtml(generatedAt)}</dd></div>
          <div><dt>Prepared for</dt><dd>${escapeHtml(String(report.generatedByRole || 'admin').toUpperCase())}</dd></div>
        </dl>
      </header>
      <main class="doc-main">
        <section class="section">
          <h2>Executive overview</h2>
          <p class="lede">Plain-language synthesis of performance and position. Use it to open a conversation; use the tables below when you need to defend every rand.</p>
          <div class="prose markdown-body">${reportMarkdownToHtml(report.summary) || '<p class="cell-empty">No summary for this period.</p>'}</div>
        </section>
  ${ai
    ? `
        <section class="section">
          <h2>Commercial &amp; operational commentary</h2>
          <p class="lede">Structured management narrative (including AI-assisted sections where enabled). Narrative informs judgement; numeric schedules remain the definitive record for amounts.</p>
          <div class="narrative">
            <p class="mode-line"><strong>Analysis basis:</strong> ${escapeHtml(aiModeDisplay)}${ai.mode ? ` <span class="mode-slug">(${escapeHtml(String(ai.mode))})</span>` : ''}</p>
            ${String(ai.summary || '').trim() ? `<div class="prose markdown-body">${reportMarkdownToHtml(ai.summary)}</div>` : ''}
            ${drHtml ? `<div class="detailed-report">${drHtml}</div>` : ''}
            <div class="table-wrap">
              <table class="data-table" role="grid">
                <thead><tr><th scope="col">Strategic highlights</th><th scope="col">Key risks</th><th scope="col">Prioritised actions</th></tr></thead>
                <tbody>
                  <tr>
                    <td>${insightBulletListHtml(ai.highlights)}</td>
                    <td>${insightBulletListHtml(ai.risks)}</td>
                    <td>${insightBulletListHtml(ai.actions)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>`
    : ''}

        <section class="section">
          <h2>Financial snapshot</h2>
          <p class="lede">Core income, expense, and activity indicators straight from Valleycroft — suitable for comparing to budget, prior periods, or covenant thresholds.</p>
          <div class="table-wrap">
            <table class="data-table financial-summary">
              <thead><tr><th scope="col">Indicator</th><th scope="col" class="td-num">Amount / value</th></tr></thead>
              <tbody>
                <tr><td>Recognised revenue</td><td class="td-num">${escapeHtml(fmtRand(fd.recognizedRevenue))}</td></tr>
                <tr><td>Payments collected</td><td class="td-num">${escapeHtml(fmtRand(fd.paymentsCollected))}</td></tr>
                <tr><td>Expenses</td><td class="td-num">${escapeHtml(fmtRand(fd.expenses))}</td></tr>
                <tr><td>Net result (recognized basis)</td><td class="td-num">${escapeHtml(fmtRand(fd.netRecognized))}</td></tr>
                <tr><td>Income transactions (cash-style total)</td><td class="td-num">${escapeHtml(fmtRand(fd.incomeTransactionsTotal))}</td></tr>
                <tr><td>Bookings recorded (all types)</td><td class="td-num">${escapeHtml(fmtCount(fd.bookingsCount))}</td></tr>
                <tr><td>Occupancy (reported)</td><td class="td-num">${escapeHtml(fmtPercentDisplay(fd.occupancyPct))}</td></tr>
                <tr><td>Inventory stock alerts</td><td class="td-num">${escapeHtml(fmtCount(fd.stockAlerts))}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2>Scope of data &amp; assurance</h2>
          <p class="lede">Shows where each block of numbers originates so reviewers can judge coverage, lineage, and where to drill deeper in the live system.</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Domain</th><th>Evidence in this period</th><th>Coverage</th></tr></thead>
              <tbody>
                <tr><td>Bookings &amp; reservations</td><td>${escapeHtml(`${fmtCount(fd.bookingsCount)} stays | BnB ${fmtRand(fd.bnbRevenue)} | Events ${fmtRand(fd.eventRevenue)}`)}</td><td><span class="scope-note">Included</span></td></tr>
                <tr><td>Guest payments &amp; invoicing</td><td>${escapeHtml(`${fmtCount(fd.invoicesCount)} invoices | Invoiced ${fmtRand(fd.invoicedAmount)}`)}</td><td><span class="scope-note">Included</span></td></tr>
                <tr><td>Recognised vs. cash-style income</td><td>${escapeHtml(`${fmtRand(fd.recognizedRevenue)} recognised | ${fmtRand(fd.incomeTransactionsTotal)} transaction total`)}</td><td><span class="scope-note">Included</span></td></tr>
                <tr><td>Debtors &amp; suppliers</td><td>${escapeHtml(`Debtors balance ${fmtRand(fd.debtorsTotal)} | ${fmtCount(fd.suppliersCount)} supplier records`)}</td><td><span class="scope-note">Included</span></td></tr>
                <tr><td>Worker remuneration</td><td>${escapeHtml(`${fmtCount(fd.salaryCount)} payroll line(s) | ${fmtRand(fd.salaryTotal)} paid`)}</td><td><span class="scope-note">Included</span></td></tr>
                <tr><td>Inventory &amp; stock</td><td>${escapeHtml(`${fmtCount(fd.stockItems)} SKU(s) | ${fmtCount(fd.stockAlerts)} below reorder`)}</td><td><span class="scope-note">Included</span></td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2>Income &amp; expense by category</h2>
          <p class="lede">Volume and value by posting category — useful for spotting concentration, one-offs, and drift against plan.</p>
          <div class="table-wrap">
            ${transactionRows.length
        ? `<div class="txn-cat-list" role="table" aria-label="Income and expense by category">
      <div class="txn-cat-head" role="row">
        <span class="txn-cat-col-cat" role="columnheader">Category</span>
        <span class="txn-cat-col-num" role="columnheader">Count</span>
        <span class="txn-cat-col-num" role="columnheader">Total</span>
      </div>
      ${transactionRows
        .map(
          (row) => `<div class="txn-cat-row" role="row">
        <span class="txn-cat-col-cat" role="cell">${escapeHtml(formatTransactionCategoryLine(row))}</span>
        <span class="txn-cat-col-num" role="cell">${escapeHtml(fmtCount(row.count))}</span>
        <span class="txn-cat-col-num" role="cell">${escapeHtml(fmtRand(row.total))}</span>
      </div>`,
        )
        .join('')}
    </div>`
        : '<div class="txn-cat-empty">No transaction category rows in this period.</div>'}
          </div>
        </section>

        <section class="section">
          <h2>Largest guest stays (by value)</h2>
          <p class="lede">Highest-value accommodation events in the window — often where revenue quality and guest mix show up first.</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Guest</th><th>Type</th><th>Stay / room</th><th>Date</th><th class="td-num">Amount</th></tr></thead>
              <tbody>
      ${bookingRows.length
        ? bookingRows
          .map((row) => `<tr><td>${escapeHtml(String(row.guest ?? ''))}</td><td>${escapeHtml(String(row.type ?? ''))}</td><td>${escapeHtml(String(row.room ?? row.stay ?? ''))}</td><td>${fmtReportCellDate(row.date ?? row.checkIn ?? row.startDate)}</td><td class="td-num">${escapeHtml(fmtRand(row.amount))}</td></tr>`)
          .join('')
        : '<tr><td colspan="5" class="cell-muted">No bookings found in this period.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2>Receivables spotlight</h2>
          <p class="lede">Outstanding guest and related invoices selected for management attention (status, due date, amount).</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Reference</th><th>Party</th><th>Status</th><th>Due date</th><th class="td-num">Amount</th></tr></thead>
              <tbody>
      ${invoiceRows.length
        ? invoiceRows
          .map((row) => `<tr><td>${escapeHtml(String(row.reference ?? row.ref ?? ''))}</td><td>${escapeHtml(String(row.party ?? row.guest ?? ''))}</td><td>${escapeHtml(String(row.status ?? ''))}</td><td>${fmtReportCellDate(row.dueDate ?? row.due)}</td><td class="td-num">${escapeHtml(fmtRand(row.amount ?? row.total))}</td></tr>`)
          .join('')
        : '<tr><td colspan="5" class="cell-muted">No invoices in this period.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2>Supply chain — below reorder</h2>
          <p class="lede">Items that may interrupt service or housekeeping if not replenished promptly.</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Item</th><th>Category</th><th class="td-num">Quantity</th><th class="td-num">Reorder level</th></tr></thead>
              <tbody>
      ${stockRows.length
        ? stockRows
          .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.category)}</td><td class="td-num">${fmtStockQty(row.quantity)}</td><td class="td-num">${fmtStockQty(row.reorderLevel)}</td></tr>`)
          .join('')
        : '<tr><td colspan="4" class="cell-muted">No low stock alerts.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <footer class="doc-footer">
        This document consolidates Valleycroft dashboards and transactional postings as at the generation timestamp above.
        Amounts reflect system-of-record data; Finance and executive roles receive read-only extracts. Formal adjustments follow your agreed change-control process.
      </footer>
    </article>
  </div>
</body>
</html>`;
}

function reportPdfFileName(report) {
  const base = String(report?.title || 'business-report')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'business-report'}-${String(report?.monthKey || 'period')}.pdf`;
}

/**
 * Rasterise a DOM node to A4 PDF. html2pdf clones into the main document and drops head styles;
 * we capture inside the iframe so CSS matches Preview.
 */
async function exportElementToPdfA4(element, filename) {
  const marginMm = 8;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - 2 * marginMm;
  const contentH = pageH - 2 * marginMm;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    letterRendering: true,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: Math.min(1024, Math.max(800, element.scrollWidth + 64)),
    backgroundColor: '#e8e6e1',
    onclone(clonedDoc) {
      try {
        const b = clonedDoc.body;
        if (b) {
          b.style.overflow = 'visible';
          b.style.height = 'auto';
        }
        const root = clonedDoc.querySelector('.doc');
        if (root) {
          root.style.overflow = 'visible';
          root.style.height = 'auto';
        }
      } catch {
        /* ignore */
      }
    },
  });

  const imgWmm = contentW;
  const imgHmm = (canvas.height * imgWmm) / canvas.width;
  const pxPerPage = Math.max(1, (contentH / imgHmm) * canvas.height);

  let yPx = 0;
  let first = true;
  while (yPx < canvas.height) {
    if (!first) pdf.addPage();
    first = false;
    const sliceH = Math.min(canvas.height - yPx, Math.ceil(pxPerPage));
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#e8e6e1';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    }
    const dataUri = slice.toDataURL('image/jpeg', 0.92);
    const sliceMmH = (sliceH * imgWmm) / canvas.width;
    pdf.addImage(dataUri, 'JPEG', marginMm, marginMm, imgWmm, sliceMmH);
    yPx += sliceH;
  }

  pdf.save(filename);
}

function normalizeInsight(payload) {
  const insight =
    payload?.insight ??
    payload?.data?.insight ??
    payload?.data?.data?.insight ??
    null;
  if (!insight) return null;
  const reportId =
    payload?.reportId ??
    payload?.meta?.reportId ??
    payload?.data?.reportId ??
    payload?.data?.meta?.reportId ??
    payload?.data?.data?.reportId ??
    insight?.reportId ??
    null;
  const modeRaw = String(insight.mode || 'fallback');
  const modeLabel = String(insight.modeLabel || '').trim();
  const drIn = insight.detailedReport;
  const execFromDr =
    drIn != null && typeof drIn === 'object' && !Array.isArray(drIn)
      ? String(drIn.executiveSummary || '').trim()
      : '';
  const summaryText = String(insight.summary || '').trim() || execFromDr;
  let detailedReport = null;
  if (drIn != null && typeof drIn === 'object' && !Array.isArray(drIn)) {
    const { executiveSummary: _execOmit, ...rest } = drIn;
    detailedReport = Object.keys(rest).length > 0 ? { ...rest } : null;
  } else if (typeof drIn === 'string' && drIn.trim()) {
    detailedReport = { narrative: drIn.trim() };
  }
  if (insight.sections && typeof insight.sections === 'object' && !Array.isArray(insight.sections)) {
    if (detailedReport && !detailedReport.sections) {
      detailedReport = { ...detailedReport, sections: insight.sections };
    } else if (!detailedReport) {
      detailedReport = { sections: insight.sections };
    }
  }
  return {
    reportId: reportId != null && String(reportId).trim() ? String(reportId).trim() : '',
    summary: summaryText,
    highlights: Array.isArray(insight.highlights) ? insight.highlights : [],
    risks: Array.isArray(insight.risks) ? insight.risks : [],
    actions: Array.isArray(insight.actions) ? insight.actions : [],
    modeRaw,
    mode: modeRaw.toLowerCase(),
    modeLabel,
    detailedReport,
  };
}

function periodTitle(period) {
  const p = String(period || 'monthly');
  return `${p.slice(0, 1).toUpperCase()}${p.slice(1)} AI Business Performance Report`;
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  const canCompile = role === 'admin';
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [refreshTick, setRefreshTick] = useState(0);
  const [previewReport, setPreviewReport] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [lastCompiledReportId, setLastCompiledReportId] = useState('');
  const [aiProvider, setAiProvider] = useState('auto');
  const [pdfExporting, setPdfExporting] = useState(false);
  const isConsumerRole = role === 'finance' || role === 'ceo';
  const reportsListEnabled = ['admin', 'finance', 'ceo'].includes(role);
  const restrictSavedListToAdminAuthors = role === 'finance' || role === 'ceo';

  function handleRefreshSavedReportsList() {
    queryClient.invalidateQueries({ queryKey: ['reports', 'saved-db-list'] });
  }

  const listPeriodParam = periodFilter || 'monthly';

  const fetchedReportsQuery = useQuery({
    queryKey: ['reports', 'saved-db-list', role, listPeriodParam],
    enabled: reportsListEnabled,
    retry: 1,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await listSavedAiReports({
        limit: 100,
        page: 1,
        period: listPeriodParam,
      });
      const rawList = extractSavedReportsArray(res?.data ?? res);
      let mapped = rawList.map(savedDbReportToUiRow).filter(Boolean);
      if (restrictSavedListToAdminAuthors) {
        mapped = mapped.filter((row) => String(row.generatedByRole || 'admin').toLowerCase() === 'admin');
      }
      const seen = new Set();
      const deduped = [];
      for (const row of mapped) {
        const k = String(row.id || '');
        if (!k || seen.has(k)) continue;
        seen.add(k);
        deduped.push(row);
      }
      deduped.sort((a, b) => new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime());
      return deduped;
    },
  });

  const allReports = useMemo(() => {
    const rows = Array.isArray(fetchedReportsQuery.data) ? fetchedReportsQuery.data : [];
    if (rows.length) return rows;
    if (role === 'finance' || role === 'ceo') {
      return readStoredReports().filter((r) => String(r?.generatedByRole || '').toLowerCase() === 'admin');
    }
    if (role === 'admin') {
      return readStoredReports();
    }
    return readStoredReports();
  }, [role, fetchedReportsQuery.data, refreshTick]);

  const reports = useMemo(() => {
    let r = allReports;
    if (periodFilter) r = r.filter((x) => x.period === periodFilter);
    if (monthFilter) r = r.filter((x) => String(x.monthKey || '') === monthFilter);
    if (!search.trim()) return r;
    const q = search.trim().toLowerCase();
    return r.filter(
      (x) => String(x.title || '').toLowerCase().includes(q)
        || String(x.summary || '').toLowerCase().includes(q)
        || String(x.periodLabel || '').toLowerCase().includes(q)
    );
  }, [allReports, search, periodFilter, monthFilter]);

  const recentRuns = useMemo(() => reports.slice(0, 10), [reports]);

  async function handleGenerate() {
    if (!canCompile) return;
    setIsGenerating(true);
    setStatusMsg('');
    try {
      const period = periodFilter || 'monthly';
      const aiRes = await compileAiReport(period, { provider: aiProvider });
      const envelope = aiRes?.data ?? aiRes;
      const reportId =
        pickCompileReportId(aiRes)
        || String(envelope?.reportId ?? envelope?.data?.reportId ?? envelope?.meta?.reportId ?? '').trim()
        || normalizeInsight(envelope)?.reportId
        || '';
      const insight = normalizeInsight(envelope);
      await queryClient.invalidateQueries({ queryKey: ['reports', 'saved-db-list'] });
      setRefreshTick((n) => n + 1);
      if (!reportId) {
        setLastCompiledReportId('');
        setStatusType('error');
        setStatusMsg('Compile finished but reportId was missing from the API response.');
        return;
      }
      setLastCompiledReportId(String(reportId));
      if (!insight) {
        setStatusType('success');
        setStatusMsg(`Report saved (id: ${String(reportId)}). Insight payload was not returned — open the new row in the list.`);
        return;
      }
      setStatusType('success');
      setStatusMsg(`Report saved to the database. Id: ${String(reportId)}. The list has been refreshed.`);
    } catch (err) {
      setStatusType('error');
      setStatusMsg(err?.message || 'Could not compile AI report.');
    } finally {
      setIsGenerating(false);
    }
  }

  /**
   * Downloads a PDF from the same HTML/CSS as Preview. Uses html2canvas on the iframe document
   * in the iframe so head-linked CSS and layout match Preview.
   */
  async function openPdfReport(report) {
    if (pdfExporting) return;
    let html;
    try {
      html = buildReportHtml(report);
    } catch {
      setStatusType('error');
      setStatusMsg('Could not build the report for PDF.');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'report-pdf-source');
    Object.assign(iframe.style, {
      position: 'fixed',
      left: '-12000px',
      top: '0',
      width: '1024px',
      minHeight: '1400px',
      border: '0',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(iframe);

    const removeIframe = () => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    };

    setPdfExporting(true);
    setStatusMsg('');

    try {
      await new Promise((resolve, reject) => {
        const t = window.setTimeout(() => reject(new Error('Timed out preparing PDF.')), 25000);
        const done = () => {
          window.clearTimeout(t);
          resolve();
        };
        const fail = () => {
          window.clearTimeout(t);
          reject(new Error('Could not load report HTML.'));
        };
        iframe.addEventListener('load', done, { once: true });
        iframe.addEventListener('error', fail, { once: true });
        iframe.srcdoc = html;
      });

      const iframeDoc = iframe.contentDocument;
      const body = iframeDoc?.body;
      if (!body) throw new Error('Missing document body for PDF.');

      await waitForIframeFonts(iframeDoc);
      await new Promise((r) => setTimeout(r, 400));

      const captureRoot = body.querySelector('.doc') || body;
      await exportElementToPdfA4(captureRoot, reportPdfFileName(report));

      setStatusType('success');
      setStatusMsg('PDF downloaded — styled like Preview (captured from the same document).');
    } catch (err) {
      setStatusType('error');
      setStatusMsg(err?.message || 'Could not generate PDF. Try again.');
    } finally {
      removeIframe();
      setPdfExporting(false);
    }
  }

  function handleDeleteReport(report) {
    if (!canCompile) return;
    const id = String(report?.id || '').trim();
    if (!id) return;
    setDeleteTarget(report);
  }

  async function confirmDeleteReport() {
    if (!canCompile || !deleteTarget || deletePending) return;
    const localId = String(deleteTarget?.id || '').trim();
    if (!localId) {
      setDeleteTarget(null);
      return;
    }

    const serverId = String(deleteTarget?.reportDbId ?? localId.replace(/^api-/, '') ?? '').trim();
    const isServerRow = Boolean(deleteTarget?.reportDbId) || localId.startsWith('api-');

    if (isServerRow && serverId) {
      setDeletePending(true);
      try {
        await deleteSavedAiReport(serverId);
        await queryClient.invalidateQueries({ queryKey: ['reports', 'saved-db-list'] });
        setRefreshTick((n) => n + 1);
        setStatusType('success');
        setStatusMsg('Report deleted from the server.');
        const prevId = String(previewReport?.reportDbId ?? previewReport?.id ?? '').replace(/^api-/, '');
        if (previewReport && (prevId === serverId || String(previewReport.id) === localId)) {
          setPreviewReport(null);
        }
      } catch (err) {
        setStatusType('error');
        setStatusMsg(
          err?.response?.data?.message || err?.message || 'Could not delete this report. Check the API DELETE route.'
        );
      } finally {
        setDeletePending(false);
        setDeleteTarget(null);
      }
      return;
    }

    const next = readStoredReports().filter((row) => String(row?.id || '').trim() !== localId);
    writeStoredReports(next);
    setRefreshTick((n) => n + 1);
    setStatusType('success');
    setStatusMsg('Report deleted.');
    if (previewReport && String(previewReport?.id || '').trim() === localId) {
      setPreviewReport(null);
    }
    setDeleteTarget(null);
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Reports & Analytics</div>
          <div className="page-subtitle">
            {canCompile ? (
              <>
                Generate management-ready performance reports. Preview and PDF always match the saved snapshot for each compile.
                {' '}
                Rich AI commentary uses configured provider keys on the server; otherwise the list may show a database-summary fallback.
                {lastCompiledReportId ? (
                  <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    Last saved report id: <code style={{ fontSize: 12 }}>{lastCompiledReportId}</code>
                  </span>
                ) : null}
              </>
            ) : (
              'Read-only access to reports compiled by your administrator.'
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {canCompile ? (
            <>
              <label className="sr-only" htmlFor="reports-ai-provider">AI provider</label>
              <select
                id="reports-ai-provider"
                className="form-control"
                style={{ minWidth: 220 }}
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                title="Forced provider uses that engine only; Auto runs the server fallback chain."
              >
                {AI_PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerate}
                disabled={isGenerating}
                title="POST body includes period and provider. Server keys determine which engines work; list refresh uses GET /ai-summaries."
              >
                <i className="fas fa-file-pdf" /> {isGenerating ? 'Compiling…' : 'Compile & Save Report'}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {statusMsg ? (
        <div className={`card ${statusType === 'error' ? 'card--error' : 'card--success'}`} style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ fontSize: 13 }}>{statusMsg}</div>
        </div>
      ) : null}
      {reportsListEnabled && fetchedReportsQuery.isError ? (
        <div className="card card--error" style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ fontSize: 13 }}>
            {fetchedReportsQuery.error?.message || 'Could not fetch reports from API. Showing local admin reports if available.'}
          </div>
        </div>
      ) : null}
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
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        {reportsListEnabled ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleRefreshSavedReportsList}
            disabled={fetchedReportsQuery.isFetching}
            title="Reload the saved report list from the server (GET only)."
          >
            {fetchedReportsQuery.isFetching ? 'Refreshing…' : 'Refresh list'}
          </button>
        ) : null}
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Compiled reports</div>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th>Report</th>
                <th>Period</th>
                <th>Generated</th>
                <th>Compiled by</th>
                <th>Summary</th>
                <th>Format</th>
                <th>Mode</th>
                <th style={{ width: canCompile ? 300 : 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reportsListEnabled && fetchedReportsQuery.isPending ? (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-muted)' }}>
                    Loading reports…
                  </td>
                </tr>
              ) : null}
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-muted)' }}>
                    {role === 'admin'
                      ? 'No compiled reports match your filters yet.'
                      : 'No reports were returned for the selected filters.'}
                  </td>
                </tr>
              ) : null}
              {recentRuns.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.title}</strong></td>
                  <td>{row.periodLabel}</td>
                  <td>{fmtDateTime(row.generatedAt)}</td>
                  <td>{String(row.generatedByRole || '').toUpperCase()}</td>
                  <td style={{ maxWidth: 300 }}>{String(row.summary || '').slice(0, 130)}{String(row.summary || '').length > 130 ? '…' : ''}</td>
                  <td>PDF</td>
                  <td>
                    <span
                      className="badge badge-confirmed"
                      title={String(row?.insight?.mode || row?.insight?.modeLabel || '')}
                    >
                      {displayInsightModeLabel(row?.insight)}
                    </span>
                  </td>
                  <td>
                    <div className="transactions-table-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewReport(row)}>
                        Preview
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void openPdfReport(row)}
                        disabled={pdfExporting}
                        title="Download PDF — same HTML and styles as Preview (no pop-up)."
                      >
                        {pdfExporting ? 'Preparing…' : 'Download PDF'}
                      </button>
                      {canCompile ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDeleteReport(row)}
                          title="Remove this report (server delete for saved reports, or local list for legacy rows)."
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {previewReport ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reports-preview-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14, 22, 16, 0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: 'min(96vw, 1520px)',
              height: 'min(92vh, 980px)',
              background: '#f4f7f4',
              border: '1px solid rgba(30, 50, 35, 0.12)',
              borderRadius: 16,
              boxShadow: '0 4px 6px rgba(0,0,0,0.03), 0 24px 64px rgba(8, 20, 10, 0.22)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '16px 22px',
                borderBottom: '1px solid #d5e2d8',
                background: 'linear-gradient(180deg, #ffffff 0%, #f6faf6 100%)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#6b7f6e',
                    marginBottom: 6,
                  }}
                >
                  Document preview
                </div>
                <strong id="reports-preview-title" style={{ color: '#14221a', fontSize: 17, fontWeight: 700, lineHeight: 1.3, display: 'block' }}>
                  {previewReport.title}
                </strong>
                <div style={{ fontSize: 12, color: '#4d5f50', marginTop: 8, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 600, color: '#2d4030' }}>{previewReport.periodLabel}</span>
                  <span style={{ margin: '0 6px', color: '#a8b8aa' }}>|</span>
                  Generated {fmtDateTime(previewReport.generatedAt)}
                  {(previewReport?.insight?.mode || previewReport?.insight?.modeLabel) ? (
                    <>
                      <span style={{ margin: '0 6px', color: '#a8b8aa' }}>|</span>
                      <span style={{ fontWeight: 500 }}>{displayInsightModeLabel(previewReport.insight)}</span>
                      {previewReport.insight.mode ? (
                        <span style={{ opacity: 0.75, fontSize: 11 }}> ({String(previewReport.insight.mode)})</span>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void openPdfReport(previewReport)}
                  disabled={pdfExporting}
                  title="Download PDF — same layout as this preview."
                >
                  <i className="fas fa-download" /> {pdfExporting ? 'Preparing…' : 'Download PDF'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewReport(null)}>
                  <i className="fas fa-times" /> Close
                </button>
              </div>
            </div>
            <iframe
              title="Report preview"
              style={{
                flex: 1,
                width: '100%',
                border: 0,
                background: '#ecefe9',
                display: 'block',
              }}
              srcDoc={buildReportHtml(previewReport)}
            />
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(12, 20, 12, 0.58)',
            zIndex: 1250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: 'min(560px, 96vw)',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #d8e6d5',
              boxShadow: '0 24px 56px rgba(7, 16, 7, 0.32)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #e2ece0',
                background: 'linear-gradient(180deg, #ffffff 0%, #f3f8f1 100%)',
              }}
            >
              <strong style={{ color: '#183515' }}>Confirm report deletion</strong>
            </div>
            <div style={{ padding: 18 }}>
              <p style={{ margin: 0, color: 'var(--text-dark)' }}>
                Delete <strong>{String(deleteTarget?.title || 'this report')}</strong>? This action cannot be undone.
              </p>
            </div>
            <div
              style={{
                padding: '12px 18px 16px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDeleteTarget(null)} disabled={deletePending}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void confirmDeleteReport()} disabled={deletePending}>
                {deletePending ? 'Deleting…' : 'Delete report'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

