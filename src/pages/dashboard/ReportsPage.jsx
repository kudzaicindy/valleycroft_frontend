import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getBookings } from '@/api/bookings';
import { getGuestBookings } from '@/api/guestBookings';
import { getDebtors } from '@/api/debtors';
import { getFinanceDashboard, getSalary, getTransactions } from '@/api/finance';
import { getInvoices } from '@/api/invoices';
import { getStock } from '@/api/inventory';
import { getRefunds } from '@/api/refunds';
import { getSuppliers } from '@/api/suppliers';
import { getAiSummary } from '@/api/reports';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { jsPDF } from 'jspdf';

const STORAGE_KEY = 'valleycroft_compiled_reports_v1';
const PERIOD_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

function safeArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

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

function pickDate(row) {
  return row?.paidOn || row?.date || row?.checkIn || row?.eventDate || row?.dueDate || row?.createdAt || null;
}

function inRange(row, range) {
  const d = new Date(pickDate(row));
  if (Number.isNaN(d.getTime())) return false;
  return d >= range.start && d <= range.end;
}

function sum(items, getNum) {
  return items.reduce((acc, item) => acc + Number(getNum(item) || 0), 0);
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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function buildReportHtml(report) {
  const m = report.metrics;
  const generatedAt = fmtDateTime(report.generatedAt);
  const ai = report?.insight ?? null;
  const transactionRows = Array.isArray(report.detail?.transactionsByCategory) ? report.detail.transactionsByCategory : [];
  const bookingRows = Array.isArray(report.detail?.topBookings) ? report.detail.topBookings : [];
  const invoiceRows = Array.isArray(report.detail?.topInvoices) ? report.detail.topInvoices : [];
  const stockRows = Array.isArray(report.detail?.lowStockItems) ? report.detail.lowStockItems : [];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Inter", Arial, sans-serif; color: #162316; margin: 0; background: #f5f8f4; }
    .wrap { max-width: 1080px; margin: 20px auto; background: #fff; border: 1px solid #dbe6d9; border-radius: 14px; padding: 26px; box-shadow: 0 10px 28px rgba(14, 31, 14, 0.08); }
    .head { border-bottom: 2px solid #e6efe4; padding-bottom: 14px; margin-bottom: 16px; }
    h1 { margin: 0 0 8px; color: #163114; font-size: 28px; letter-spacing: 0.02em; }
    h2 { margin: 24px 0 10px; color: #1a3612; font-size: 17px; border-left: 4px solid #2d5a1f; padding-left: 8px; }
    p { margin: 6px 0; line-height: 1.6; font-size: 13px; }
    .meta { color: #4a5f4a; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .tile { border: 1px solid #d7e4d5; border-radius: 10px; padding: 11px; background: linear-gradient(180deg, #fbfdfb 0%, #f4f9f2 100%); }
    .label { color: #567056; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .value { font-size: 19px; font-weight: 700; margin-top: 4px; color: #183515; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #d9e7d7; }
    th, td { border: 1px solid #d9e7d7; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }
    th { background: #edf5ea; color: #244224; font-weight: 700; }
    .footer { margin-top: 14px; font-size: 11px; color: #5e715e; border-top: 1px solid #e4ece2; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="wrap">
  <div class="head">
  <h1>${escapeHtml(report.title)}</h1>
  <p class="meta">Period: ${escapeHtml(report.periodLabel)} | Compiled by: ${escapeHtml(report.generatedByRole.toUpperCase())} | Generated: ${escapeHtml(generatedAt)}</p>
  </div>
  <h2>Executive Summary</h2>
  <p>${escapeHtml(report.summary)}</p>
  ${ai
    ? `
  <h2>AI Narrative</h2>
  <p><strong>Mode:</strong> ${escapeHtml(ai.mode === 'openai' ? 'AI-powered' : 'Fallback summary')}</p>
  <p>${escapeHtml(ai.summary || '')}</p>
  <table>
    <thead><tr><th>Highlights</th><th>Risks</th><th>Actions</th></tr></thead>
    <tbody>
      <tr>
        <td>${escapeHtml((ai.highlights || []).join(' | ') || '—')}</td>
        <td>${escapeHtml((ai.risks || []).join(' | ') || '—')}</td>
        <td>${escapeHtml((ai.actions || []).join(' | ') || '—')}</td>
      </tr>
    </tbody>
  </table>`
    : ''}

  <div class="grid">
    <div class="tile"><div class="label">Revenue</div><div class="value">${escapeHtml(fmtRand(m.revenue))}</div></div>
    <div class="tile"><div class="label">Expenses</div><div class="value">${escapeHtml(fmtRand(m.expenses))}</div></div>
    <div class="tile"><div class="label">Net</div><div class="value">${escapeHtml(fmtRand(m.net))}</div></div>
    <div class="tile"><div class="label">Bookings (all)</div><div class="value">${escapeHtml(String(m.bookingsCount))}</div></div>
    <div class="tile"><div class="label">Occupancy</div><div class="value">${escapeHtml(`${m.occupancyPct}%`)}</div></div>
    <div class="tile"><div class="label">Stock alerts</div><div class="value">${escapeHtml(String(m.stockAlerts))}</div></div>
  </div>

  <h2>Coverage Across Admin and Finance Pages</h2>
  <table>
    <thead><tr><th>Area</th><th>Metric</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>Bookings & Reservations</td><td>${escapeHtml(`${m.bookingsCount} bookings | BnB ${fmtRand(m.bnbRevenue)} | Events ${fmtRand(m.eventRevenue)}`)}</td><td>Included</td></tr>
      <tr><td>Guest Payments / Invoices</td><td>${escapeHtml(`${m.invoicesCount} invoices | Invoiced total ${fmtRand(m.invoicedAmount)}`)}</td><td>Included</td></tr>
      <tr><td>Transactions / Expenses</td><td>${escapeHtml(`${fmtRand(m.revenue)} income | ${fmtRand(m.expenses)} expenses`)}</td><td>Included</td></tr>
      <tr><td>Debtors / Suppliers</td><td>${escapeHtml(`Debtors ${fmtRand(m.debtorsTotal)} | Suppliers ${m.suppliersCount}`)}</td><td>Included</td></tr>
      <tr><td>Worker Payments</td><td>${escapeHtml(`${m.salaryCount} salary records | ${fmtRand(m.salaryTotal)} paid`)}</td><td>Included</td></tr>
      <tr><td>Inventory</td><td>${escapeHtml(`${m.stockItems} items | ${m.stockAlerts} low stock`)}</td><td>Included</td></tr>
    </tbody>
  </table>

  <h2>Transaction Category Breakdown</h2>
  <table>
    <thead><tr><th>Type</th><th>Category</th><th>Count</th><th>Total</th></tr></thead>
    <tbody>
      ${transactionRows.length
        ? transactionRows
          .map((row) => `<tr><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(String(row.count))}</td><td>${escapeHtml(fmtRand(row.total))}</td></tr>`)
          .join('')
        : '<tr><td colspan="4">No transaction category rows in this period.</td></tr>'}
    </tbody>
  </table>

  <h2>Top Bookings in Period</h2>
  <table>
    <thead><tr><th>Guest</th><th>Type</th><th>Stay/Room</th><th>Date</th><th>Amount</th></tr></thead>
    <tbody>
      ${bookingRows.length
        ? bookingRows
          .map((row) => `<tr><td>${escapeHtml(row.guest)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.room)}</td><td>${escapeHtml(row.date)}</td><td>${escapeHtml(fmtRand(row.amount))}</td></tr>`)
          .join('')
        : '<tr><td colspan="5">No bookings found in this period.</td></tr>'}
    </tbody>
  </table>

  <h2>Invoice Focus</h2>
  <table>
    <thead><tr><th>Reference</th><th>Party</th><th>Status</th><th>Due date</th><th>Amount</th></tr></thead>
    <tbody>
      ${invoiceRows.length
        ? invoiceRows
          .map((row) => `<tr><td>${escapeHtml(row.reference)}</td><td>${escapeHtml(row.party)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.dueDate)}</td><td>${escapeHtml(fmtRand(row.amount))}</td></tr>`)
          .join('')
        : '<tr><td colspan="5">No invoices in this period.</td></tr>'}
    </tbody>
  </table>

  <h2>Low Stock Items</h2>
  <table>
    <thead><tr><th>Item</th><th>Category</th><th>Quantity</th><th>Reorder level</th></tr></thead>
    <tbody>
      ${stockRows.length
        ? stockRows
          .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(String(row.quantity))}</td><td>${escapeHtml(String(row.reorderLevel))}</td></tr>`)
          .join('')
        : '<tr><td colspan="4">No low stock alerts.</td></tr>'}
    </tbody>
  </table>

  <p class="footer">This report is generated from dashboard and transactional APIs available to Admin/Finance, then made available to CEO as read-only.</p>
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

function normalizeInsight(payload) {
  const insight = payload?.insight ?? payload?.data?.insight ?? null;
  if (!insight) return null;
  return {
    summary: String(insight.summary || ''),
    highlights: Array.isArray(insight.highlights) ? insight.highlights : [],
    risks: Array.isArray(insight.risks) ? insight.risks : [],
    actions: Array.isArray(insight.actions) ? insight.actions : [],
    mode: String(insight.mode || 'fallback').toLowerCase(),
  };
}

function downloadReportPdf(report) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 38;
  const top = 44;
  const lineHeight = 15;
  const maxWidth = pageWidth - marginX * 2;
  let y = top;

  const ensureSpace = (needed = lineHeight) => {
    if (y + needed > pageHeight - 36) {
      doc.addPage();
      y = top;
    }
  };

  const write = (text, opts = {}) => {
    const size = opts.size || 10.5;
    const style = opts.style || 'normal';
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text ?? ''), maxWidth);
    lines.forEach((line) => {
      ensureSpace(lineHeight);
      doc.text(String(line), marginX, y);
      y += lineHeight;
    });
  };

  const writeSection = (title) => {
    y += 6;
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(String(title), marginX, y);
    y += 18;
  };

  const m = report?.metrics || {};
  const d = report?.detail || {};
  write(report?.title || 'Business Performance Report', { size: 16, style: 'bold' });
  write(`Period: ${report?.periodLabel || 'N/A'} | Compiled by: ${String(report?.generatedByRole || '').toUpperCase()} | Generated: ${fmtDateTime(report?.generatedAt)}`);
  write('');
  write(report?.summary || 'No summary available.');
  writeSection('Core KPIs');
  write(`Revenue: ${fmtRand(m.revenue)} | Expenses: ${fmtRand(m.expenses)} | Net: ${fmtRand(m.net)}`);
  write(`Bookings: ${m.bookingsCount || 0} | BnB revenue: ${fmtRand(m.bnbRevenue)} | Event revenue: ${fmtRand(m.eventRevenue)}`);
  write(`Occupancy: ${m.occupancyPct ?? 0}% | Invoices: ${m.invoicesCount || 0} (${fmtRand(m.invoicedAmount)})`);
  write(`Debtors: ${fmtRand(m.debtorsTotal)} | Supplier rows: ${m.suppliersCount || 0}`);
  write(`Salary records: ${m.salaryCount || 0} (${fmtRand(m.salaryTotal)}) | Stock alerts: ${m.stockAlerts || 0}/${m.stockItems || 0}`);

  writeSection('Transaction Category Breakdown');
  if (Array.isArray(d.transactionsByCategory) && d.transactionsByCategory.length) {
    d.transactionsByCategory.forEach((row) => {
      write(`- ${row.type} | ${row.category}: ${row.count} txns | ${fmtRand(row.total)}`);
    });
  } else {
    write('No transaction category rows in this period.');
  }

  writeSection('Top Bookings');
  if (Array.isArray(d.topBookings) && d.topBookings.length) {
    d.topBookings.forEach((row) => {
      write(`- ${row.guest} | ${row.type} | ${row.room} | ${row.date} | ${fmtRand(row.amount)}`);
    });
  } else {
    write('No bookings rows in this period.');
  }

  writeSection('Invoices');
  if (Array.isArray(d.topInvoices) && d.topInvoices.length) {
    d.topInvoices.forEach((row) => {
      write(`- ${row.reference} | ${row.party} | ${row.status} | due ${row.dueDate} | ${fmtRand(row.amount)}`);
    });
  } else {
    write('No invoice rows in this period.');
  }

  writeSection('Low Stock Items');
  if (Array.isArray(d.lowStockItems) && d.lowStockItems.length) {
    d.lowStockItems.forEach((row) => {
      write(`- ${row.name} (${row.category}) qty ${row.quantity} / reorder ${row.reorderLevel}`);
    });
  } else {
    write('No low stock alerts.');
  }

  doc.save(reportPdfFileName(report));
}

export default function ReportsPage() {
  const { user } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  const canCompile = role === 'admin';
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('monthly');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [refreshTick, setRefreshTick] = useState(0);
  const [previewReport, setPreviewReport] = useState(null);

  const allReports = useMemo(() => {
    const rows = readStoredReports();
    if (role !== 'admin') return rows.filter((r) => r.generatedByRole === 'admin');
    return rows;
  }, [role, refreshTick]);

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

  async function buildCompiledReport(aiSummary) {
    const range = periodRange(periodFilter || 'monthly', monthFilter);
    const params = {
      month: range.end.getMonth() + 1,
      year: range.end.getFullYear(),
      revenueMonths: periodFilter === 'annual' ? 12 : 6,
      limit: 500,
    };
    const tasks = await Promise.allSettled([
      getFinanceDashboard(params),
      getTransactions({ limit: 500 }),
      getBookings({ limit: 500 }),
      getGuestBookings({ limit: 500 }),
      getInvoices({ limit: 500 }),
      getRefunds({ limit: 500 }),
      getDebtors({ limit: 500 }),
      getSuppliers({ limit: 500 }),
      getSalary({ limit: 500 }),
      getStock({ limit: 500 }),
    ]);
    const [dashRes, txRes, internalRes, guestRes, invoicesRes, refundsRes, debtorsRes, suppliersRes, salaryRes, stockRes] = tasks;

    const dashboard = dashRes.status === 'fulfilled' ? (dashRes.value?.data?.data || dashRes.value?.data || {}) : {};
    const txRows = txRes.status === 'fulfilled' ? safeArray(txRes.value?.data ?? txRes.value) : [];
    const internalRows = internalRes.status === 'fulfilled' ? safeArray(internalRes.value?.data ?? internalRes.value) : [];
    const guestRows = guestRes.status === 'fulfilled' ? safeArray(guestRes.value?.data ?? guestRes.value) : [];
    const invoiceRows = invoicesRes.status === 'fulfilled' ? safeArray(invoicesRes.value?.data ?? invoicesRes.value) : [];
    const refundRows = refundsRes.status === 'fulfilled' ? safeArray(refundsRes.value?.data ?? refundsRes.value) : [];
    const debtorRows = debtorsRes.status === 'fulfilled' ? safeArray(debtorsRes.value?.data ?? debtorsRes.value) : [];
    const supplierRows = suppliersRes.status === 'fulfilled' ? safeArray(suppliersRes.value?.data ?? suppliersRes.value) : [];
    const salaryRows = salaryRes.status === 'fulfilled' ? safeArray(salaryRes.value?.data ?? salaryRes.value) : [];
    const stockRows = stockRes.status === 'fulfilled' ? safeArray(stockRes.value?.data ?? stockRes.value) : [];

    const bookings = [...internalRows, ...guestRows].filter((row) => inRange(row, range));
    const txInRange = txRows.filter((row) => inRange(row, range));
    const invoices = invoiceRows.filter((row) => inRange(row, range));
    const refunds = refundRows.filter((row) => inRange(row, range));
    const salaries = salaryRows.filter((row) => inRange(row, range));

    const txRevenue = sum(
      txInRange.filter((x) => String(x.type || '').toLowerCase() === 'income'),
      (x) => x.amount
    );
    const txExpenses = sum(
      txInRange.filter((x) => String(x.type || '').toLowerCase() === 'expense'),
      (x) => x.amount
    );
    const refundTotal = sum(refunds, (x) => x.amount);
    const revenue = txRevenue || Number(dashboard?.kpis?.incomeMtd || dashboard?.kpis?.receiptsMtd || 0);
    const expenses = txExpenses || Number(dashboard?.kpis?.expenseMtd || 0);
    const net = revenue - expenses - refundTotal;

    const bnbRevenue = sum(
      bookings.filter((x) => String(x.type || x.bookingType || x.category || '').toLowerCase() === 'bnb'),
      (x) => x.totalAmount ?? x.receivedAmount ?? x.amount
    );
    const eventRevenue = sum(
      bookings.filter((x) => String(x.type || x.bookingType || x.category || '').toLowerCase() === 'event'),
      (x) => x.totalAmount ?? x.receivedAmount ?? x.amount
    );

    const occupancyPct = Math.round(Number(dashboard?.operationsDashboard?.occupancy?.occupancyPct || 0));
    const stockAlerts = stockRows.filter((x) => Number(x.quantity || 0) <= Number(x.reorderLevel || 0)).length;
    const salaryTotal = sum(salaries, (x) => x.amount);
    const debtorTotal = Number(dashboard?.debtors?.totalBalance || 0) || sum(debtorRows, (x) => x.balance);
    const invoicedAmount = sum(invoices, (x) => x.amount);
    const transactionsByCategory = Object.values(
      txInRange.reduce((acc, row) => {
        const type = String(row?.type || 'unknown').toLowerCase();
        const category = String(row?.category || 'uncategorized');
        const key = `${type}::${category}`;
        if (!acc[key]) {
          acc[key] = { type, category, count: 0, total: 0 };
        }
        acc[key].count += 1;
        acc[key].total += Number(row?.amount || 0);
        return acc;
      }, {})
    ).sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    const topBookings = bookings
      .map((row, idx) => ({
        id: row?._id || row?.id || `bk-${idx}`,
        guest: String(row?.guestName || row?.guest?.name || row?.name || 'Guest'),
        type: String(row?.type || row?.bookingType || row?.category || 'booking').toUpperCase(),
        room: String(row?.roomName || row?.room?.name || row?.propertyName || '—'),
        date: toIsoDate(row?.checkIn || row?.eventDate || row?.createdAt) || '—',
        amount: Number(row?.totalAmount ?? row?.receivedAmount ?? row?.amount ?? 0),
      }))
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 8);
    const topInvoices = invoices
      .map((row, idx) => ({
        id: row?._id || row?.id || `inv-${idx}`,
        reference: String(row?.reference || row?.invoiceNumber || 'N/A'),
        party: String(row?.party || row?.guestName || row?.name || 'Guest'),
        status: String(row?.displayStatus || row?.status || '—'),
        dueDate: toIsoDate(row?.dueDate) || '—',
        amount: Number(row?.amount || 0),
      }))
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 8);
    const lowStockItems = stockRows
      .filter((x) => Number(x.quantity || 0) <= Number(x.reorderLevel || 0))
      .map((row, idx) => ({
        id: row?._id || row?.id || `stk-${idx}`,
        name: String(row?.name || 'Item'),
        category: String(row?.category || 'uncategorized'),
        quantity: Number(row?.quantity || 0),
        reorderLevel: Number(row?.reorderLevel || 0),
      }))
      .slice(0, 10);
    const recentActivity = safeArray(dashboard?.kpis?.activity || dashboard?.activityToday || [])
      .slice(0, 10)
      .map((row) => ({
        at: fmtDateTime(row?.at || row?.time || row?.createdAt || ''),
        entity: String(row?.entity || row?.type || '—'),
        action: String(row?.action || row?.title || '—'),
        detail: String(row?.detail || row?.message || '—'),
      }));

    const periodLabel = reportPeriodLabel(periodFilter || 'monthly', range);
    const title = `${(periodFilter || 'monthly').slice(0, 1).toUpperCase()}${(periodFilter || 'monthly').slice(1)} AI Business Performance Report`;
    const fallbackSummary = `Revenue ${fmtRand(revenue)}, expenses ${fmtRand(expenses)}, net ${fmtRand(net)}, ${bookings.length} bookings and ${stockAlerts} stock alerts in ${periodLabel}.`;
    const summary = String(aiSummary?.summary || fallbackSummary);

    return {
      id: `report-${Date.now()}`,
      title,
      period: periodFilter || 'monthly',
      periodLabel,
      monthKey: toIsoDate(range.end).slice(0, 7),
      generatedAt: new Date().toISOString(),
      generatedByRole: role,
      summary,
      insight: aiSummary
        ? {
            summary: aiSummary.summary,
            highlights: Array.isArray(aiSummary.highlights) ? aiSummary.highlights : [],
            risks: Array.isArray(aiSummary.risks) ? aiSummary.risks : [],
            actions: Array.isArray(aiSummary.actions) ? aiSummary.actions : [],
            mode: aiSummary.mode || 'fallback',
          }
        : null,
      metrics: {
        revenue,
        expenses,
        net,
        bookingsCount: bookings.length,
        bnbRevenue,
        eventRevenue,
        occupancyPct,
        stockAlerts,
        invoicesCount: invoices.length,
        invoicedAmount,
        debtorsTotal: debtorTotal,
        suppliersCount: supplierRows.length,
        salaryCount: salaries.length,
        salaryTotal,
        stockItems: stockRows.length,
      },
      detail: {
        periodStart: toIsoDate(range.start),
        periodEnd: toIsoDate(range.end),
        transactionsByCategory,
        topBookings,
        topInvoices,
        lowStockItems,
        recentActivity,
      },
    };
  }

  async function handleGenerate() {
    if (!canCompile) return;
    setIsGenerating(true);
    setStatusMsg('');
    try {
      const aiRes = await getAiSummary(periodFilter || 'monthly');
      const insight = normalizeInsight(aiRes?.data ?? aiRes);
      if (!insight) throw new Error('AI summary payload is missing insight data.');
      const report = await buildCompiledReport(insight);
      const next = [report, ...readStoredReports()].slice(0, 100);
      writeStoredReports(next);
      setRefreshTick((n) => n + 1);
      setStatusType('success');
      setStatusMsg('AI compiled report generated and saved successfully.');
    } catch (err) {
      setStatusType('error');
      setStatusMsg(err?.message || 'Could not compile AI report.');
    } finally {
      setIsGenerating(false);
    }
  }

  function openPdfReport(report) {
    try {
      downloadReportPdf(report);
      setStatusType('success');
      setStatusMsg('PDF download started.');
    } catch {
      setStatusType('error');
      setStatusMsg('Could not download PDF. Please try again.');
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Reports & Analytics</div>
          <div className="page-subtitle">
            {canCompile
              ? 'Compile business performance from Admin and Finance pages and export as PDF'
              : 'Read-only reports compiled by Admin'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {canCompile ? (
            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={isGenerating}>
              <i className="fas fa-file-pdf" /> {isGenerating ? 'Compiling…' : 'Compile & Save Report'}
            </button>
          ) : null}
        </div>
      </div>
      {statusMsg ? (
        <div className={`card ${statusType === 'error' ? 'card--error' : 'card--success'}`} style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ fontSize: 13 }}>{statusMsg}</div>
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
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Compiled reports</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Period</th>
                <th>Generated</th>
                <th>Compiled by</th>
                <th>Summary</th>
                <th>Format</th>
                <th>Status</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-muted)' }}>
                    No compiled reports match your filters yet.
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
                    <span className="badge badge-confirmed">Completed</span>
                  </td>
                  <td>
                    <div className="transactions-table-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewReport(row)}>
                        Preview
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openPdfReport(row)}>
                        Download
                      </button>
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(12, 20, 12, 0.66)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: '94vw',
              maxWidth: 1520,
              height: '92vh',
              background: '#f5f8f4',
              border: '1px solid rgba(220, 235, 218, 0.8)',
              borderRadius: 14,
              boxShadow: '0 26px 60px rgba(7, 16, 7, 0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #d8e6d5',
                background: 'linear-gradient(180deg, #ffffff 0%, #f3f8f1 100%)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <strong style={{ color: '#183515' }}>{previewReport.title}</strong>
                <div style={{ fontSize: 12, color: '#5b6f5b', marginTop: 2 }}>
                  {previewReport.periodLabel} · Generated {fmtDateTime(previewReport.generatedAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openPdfReport(previewReport)}>
                  <i className="fas fa-download" /> Download PDF
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewReport(null)}>
                  <i className="fas fa-times" /> Close
                </button>
              </div>
            </div>
            <iframe
              title="Report preview"
              style={{ flex: 1, width: '100%', border: 0, background: '#fff' }}
              srcDoc={buildReportHtml(previewReport)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
