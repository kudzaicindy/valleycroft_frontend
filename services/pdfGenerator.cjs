/**
 * Server-side PDF (PDFKit). Run with Node only — not bundled by Vite.
 *
 *   const { generatePDF, buildPdfKitReportFromRow } = require('./services/pdfGenerator.cjs');
 *   app.get('/reports/:id/pdf', (req, res) => generatePDF(buildPdfKitReportFromRow(doc), res));
 *
 * Requires: bufferPages: true for footer painting on all pages.
 */

const PDFDocument = require('pdfkit');

// ─── Brand colours ───────────────────────────────────────────────────────────
const GREEN = '#2D6A4F';
const DARK = '#1A1A2E';
const LIGHT_BG = '#F0F4F0';
const GREY = '#666666';
const WHITE = '#FFFFFF';
const GOLD = '#C9A84C';
const RED = '#C0392B';

function generatePDF(report, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="ValleyCroft-${String(report.period || report.periodLabel || 'Report').replace(/[^\w\-]+/g, '-')}.pdf"`,
  );
  doc.pipe(res);

  const PW = doc.page.width - 100;

  // HEADER BANNER
  doc.rect(0, 0, doc.page.width, 90).fill(GREEN);
  doc.fontSize(22).fillColor(WHITE).font('Helvetica-Bold').text('VALLEYCROFT AGRO-TOURISM', 50, 20, { align: 'left' });
  doc.fontSize(12).fillColor(GOLD).font('Helvetica').text(report.title || 'Monthly Management Report', 50, 48);
  const prepared = String(report.preparedFor || report.generatedByRole || 'ADMIN').toUpperCase();
  const periodLine = report.periodLabel || report.period || '';
  const genLine =
    report.generatedAt != null
      ? new Date(report.generatedAt).toLocaleDateString('en-ZA', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  doc
    .fontSize(9)
    .fillColor(WHITE)
    .text(`Period: ${periodLine}   |   Generated: ${genLine}   |   Prepared for: ${prepared}`, 50, 68, {
      width: PW,
    });

  doc.y = 110;

  if (report.financialSnapshot) {
    sectionHeading(doc, 'Financial Snapshot', PW);
    const kpis = report.financialSnapshot;
    const metrics = [
      { label: 'Revenue', value: fmt(kpis.revenue), color: GREEN },
      { label: 'Expenses', value: fmt(kpis.expenses), color: RED },
      { label: 'Net Profit', value: fmt(kpis.profit), color: GREEN },
      { label: 'Margin', value: kpis.marginPct != null ? `${kpis.marginPct}%` : '—', color: DARK },
    ];
    drawKPIRow(doc, metrics, PW);
    doc.moveDown(0.5);
  }

  if (report.executiveSummary) {
    sectionHeading(doc, 'Executive Overview', PW);
    bodyText(doc, plainTextFromMarkdown(report.executiveSummary), PW);
  }

  if (Array.isArray(report.sections)) {
    report.sections.forEach((section) => {
      checkNewPage(doc, 120);
      sectionHeading(doc, section.heading, PW);

      if (section.content) bodyText(doc, plainTextFromMarkdown(section.content), PW);

      if (Array.isArray(section.metrics) && section.metrics.length) {
        drawMetricsTable(doc, section.metrics, PW);
      }

      if (Array.isArray(section.keyPoints) && section.keyPoints.length) {
        section.keyPoints.forEach((pt) => {
          checkNewPage(doc, 25);
          doc.fontSize(10).fillColor(DARK).font('Helvetica').text(`  •  ${plainTextFromMarkdown(pt)}`, {
            width: PW,
            indent: 10,
          });
          doc.moveDown(0.2);
        });
        doc.moveDown(0.5);
      }
    });
  }

  if (Array.isArray(report.receivables) && report.receivables.length) {
    checkNewPage(doc, 140);
    sectionHeading(doc, 'Receivables Spotlight', PW);
    const headers = ['Reference', 'Party', 'Due Date', 'Amount'];
    const rows = report.receivables.map((r) => [
      r.reference || '',
      r.party || '',
      r.dueDate || '',
      fmt(r.amount),
    ]);
    drawTable(doc, headers, rows, PW);
  }

  if (Array.isArray(report.topGuests) && report.topGuests.length) {
    checkNewPage(doc, 140);
    sectionHeading(doc, 'Largest Guest Stays', PW);
    const headers = ['Guest', 'Type', 'Room', 'Date', 'Amount'];
    const rows = report.topGuests.map((g) => [
      g.name || '',
      g.type || '',
      g.room || '',
      g.date || '',
      fmt(g.amount),
    ]);
    drawTable(doc, headers, rows, PW);
  }

  if (Array.isArray(report.stockAlerts) && report.stockAlerts.length) {
    checkNewPage(doc, 100);
    sectionHeading(doc, 'Supply Chain — Below Reorder', PW);
    const headers = ['Item', 'Category', 'Qty', 'Reorder Level'];
    const rows = report.stockAlerts.map((s) => [
      s.item || '',
      s.category || '',
      String(s.quantity ?? ''),
      String(s.reorderLevel ?? ''),
    ]);
    drawTable(doc, headers, rows, PW);
  }

  if (Array.isArray(report.risks) && report.risks.length) {
    checkNewPage(doc, 120);
    sectionHeading(doc, 'Risk Assessment', PW);
    report.risks.forEach((r) => {
      checkNewPage(doc, 40);
      const likelihoodColor =
        r.likelihood === 'High' ? RED : r.likelihood === 'Medium' ? GOLD : GREEN;
      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold').text(r.risk || '', { continued: true, width: PW - 60 });
      doc.fillColor(likelihoodColor).font('Helvetica').text(`  [${r.likelihood || ''}]`);
      if (r.mitigation) {
        doc.fontSize(9.5).fillColor(GREY).font('Helvetica').text(`  ↳ ${r.mitigation}`, { indent: 15, width: PW });
      }
      doc.moveDown(0.4);
    });
    doc.moveDown(0.3);
  }

  if (Array.isArray(report.recommendations) && report.recommendations.length) {
    checkNewPage(doc, 120);
    sectionHeading(doc, 'Recommendations', PW);
    report.recommendations.forEach((rec, i) => {
      checkNewPage(doc, 40);
      const action = typeof rec === 'string' ? rec : rec.action;
      const priority = typeof rec === 'object' ? rec.priority : null;
      const impact = typeof rec === 'object' ? rec.expectedImpact : null;
      const priColor = priority === 'High' ? RED : priority === 'Medium' ? GOLD : GREEN;

      doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold').text(`${i + 1}.  `, { continued: true });
      doc.fillColor(DARK).font('Helvetica').text(action || '', { width: PW - 20 });
      if (priority || impact) {
        doc
          .fontSize(9)
          .fillColor(priColor)
          .text(`     Priority: ${priority || '—'}   |   Impact: ${impact || '—'}`, { indent: 15, width: PW });
      }
      doc.moveDown(0.4);
    });
    doc.moveDown(0.3);
  }

  if (report.outlook) {
    checkNewPage(doc, 80);
    sectionHeading(doc, 'Forecast & Outlook', PW);
    bodyText(doc, plainTextFromMarkdown(report.outlook), PW);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.rect(0, doc.page.height - 35, doc.page.width, 35).fill(GREEN);
    doc
      .fontSize(8)
      .fillColor(WHITE)
      .font('Helvetica')
      .text(
        `ValleyCroft Agro-Tourism  |  Confidential  |  Page ${i + 1} of ${range.count}`,
        50,
        doc.page.height - 22,
        { align: 'center', width: doc.page.width - 100 },
      );
  }

  doc.end();
}

const TABLE_HEADER_H = 22;
const TABLE_ROW_H = 20;
const FOOTER_RESERVE = 58;
const LEFT = 50;

function sectionHeading(doc, text, pw) {
  checkNewPage(doc, 52);
  const y = doc.y;
  doc.rect(LEFT, y, 4, 26).fill(GREEN);
  doc.rect(LEFT + 4, y, pw - 4, 26).fill(LIGHT_BG);
  doc
    .fillColor(GREEN)
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .text(text, LEFT + 12, y + 7, { width: pw - 20 });
  doc.y = y + 32;
  doc.moveDown(0.15);
}

function bodyText(doc, text, pw) {
  doc.fontSize(10.5).fillColor(DARK).font('Helvetica').text(text, { width: pw, lineGap: 4 });
  doc.moveDown(0.55);
}

function drawKPIRow(doc, metrics, pw) {
  const gap = 10;
  const boxW = (pw - (metrics.length - 1) * gap) / metrics.length;
  const startY = doc.y;

  metrics.forEach((m, i) => {
    const x = LEFT + i * (boxW + gap);
    doc.save();
    doc.lineWidth(1.2).strokeColor(GREEN).fillColor(DARK).rect(x, startY, boxW, 56).fillAndStroke();
    doc.restore();
    doc.fontSize(8.5).fillColor(GREY).font('Helvetica').text(m.label.toUpperCase(), x + 10, startY + 10, {
      width: boxW - 20,
    });
    doc.fontSize(15).fillColor(m.color || WHITE).font('Helvetica-Bold').text(m.value, x + 10, startY + 28, {
      width: boxW - 20,
    });
  });

  doc.y = startY + 64;
  doc.moveDown(0.45);
}

function drawMetricsTable(doc, metrics, pw) {
  const colW = pw / 3;

  function paintHeader(yTop) {
    doc.rect(LEFT, yTop, pw, TABLE_HEADER_H).fill(GREEN);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
    ['Metric', 'Value', 'Trend'].forEach((h, i) => {
      doc.text(h, 58 + i * colW, yTop + 7, { width: colW - 10 });
    });
    doc.fillColor(DARK);
    return yTop + TABLE_HEADER_H;
  }

  if (doc.y + TABLE_HEADER_H + TABLE_ROW_H > doc.page.height - FOOTER_RESERVE) {
    doc.addPage();
    doc.y = 50;
  }
  doc.y = paintHeader(doc.y);

  metrics.forEach((m, row) => {
    if (doc.y + TABLE_ROW_H > doc.page.height - FOOTER_RESERVE) {
      doc.addPage();
      doc.y = 50;
      doc.y = paintHeader(doc.y);
    }
    const y = doc.y;
    const bg = row % 2 === 0 ? '#EAF2ED' : WHITE;
    doc.rect(LEFT, y, pw, TABLE_ROW_H).fill(bg);
    doc.lineWidth(0.35).strokeColor('#b8c9bc').rect(LEFT, y, pw, TABLE_ROW_H).stroke();
    const trendColor = m.trend === 'up' ? GREEN : m.trend === 'down' ? RED : GREY;
    doc.fontSize(9).fillColor(DARK).font('Helvetica').text(m.label || '', 58, y + 6, { width: colW - 10 });
    doc.text(m.value || '', 58 + colW, y + 6, { width: colW - 10 });
    doc
      .fillColor(trendColor)
      .font('Helvetica')
      .text(m.trend === 'up' ? '▲ Up' : m.trend === 'down' ? '▼ Down' : '→ Stable', 58 + colW * 2, y + 6, {
        width: colW - 10,
      });
    doc.y = y + TABLE_ROW_H;
  });
  doc.lineWidth(1);
  doc.moveDown(0.35);
}

function drawTable(doc, headers, rows, pw) {
  const colW = pw / headers.length;

  function paintHeader(yTop) {
    doc.rect(LEFT, yTop, pw, TABLE_HEADER_H).fill(GREEN);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
    headers.forEach((h, i) => {
      doc.text(String(h), 58 + i * colW, yTop + 7, { width: colW - 10 });
    });
    doc.fillColor(DARK);
    return yTop + TABLE_HEADER_H;
  }

  if (doc.y + TABLE_HEADER_H + TABLE_ROW_H > doc.page.height - FOOTER_RESERVE) {
    doc.addPage();
    doc.y = 50;
  }
  doc.y = paintHeader(doc.y);

  rows.forEach((row, ri) => {
    if (doc.y + TABLE_ROW_H > doc.page.height - FOOTER_RESERVE) {
      doc.addPage();
      doc.y = 50;
      doc.y = paintHeader(doc.y);
    }
    const y = doc.y;
    const bg = ri % 2 === 0 ? '#EAF2ED' : WHITE;
    doc.rect(LEFT, y, pw, TABLE_ROW_H).fill(bg);
    doc.lineWidth(0.35).strokeColor('#b8c9bc').rect(LEFT, y, pw, TABLE_ROW_H).stroke();
    doc.font('Helvetica').fontSize(9).fillColor(DARK);
    row.forEach((cell, ci) => {
      doc.text(String(cell ?? ''), 58 + ci * colW, y + 5, { width: colW - 10 });
    });
    doc.y = y + TABLE_ROW_H;
  });
  doc.lineWidth(1);
  doc.moveDown(0.4);
}

function checkNewPage(doc, neededHeight = 80) {
  if (doc.y + neededHeight > doc.page.height - 60) {
    doc.addPage();
    doc.y = 50;
  }
}

function fmt(val) {
  if (val == null) return '—';
  const n = parseFloat(val);
  if (Number.isNaN(n)) return String(val);
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function plainTextFromMarkdown(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s?/gm, '')
    .trim();
}

// ─── Map Valleycroft saved / UI report row → generatePDF payload ─────────────

function pickFinanceTruth(row) {
  if (!row || typeof row !== 'object') return null;
  const ft = row.financeTruth ?? row.data?.financeTruth;
  return ft && typeof ft === 'object' ? ft : null;
}

function pickDbDetail(row) {
  if (!row || typeof row !== 'object') return null;
  const d = row.dbDetail ?? row.data?.dbDetail;
  if (d && typeof d === 'object') return d;
  const det = row.detail;
  if (
    det &&
    typeof det === 'object' &&
    (det.coverage || det.transactionCategoryBreakdown || det.topBookings || det.invoiceFocus)
  ) {
    return det;
  }
  return null;
}

function firstArray(obj, keys) {
  if (!obj || typeof obj !== 'object') return [];
  for (const k of keys) {
    if (k && Array.isArray(obj[k])) return obj[k];
  }
  return [];
}

/**
 * @param {object} row — same shape as dashboard list row (title, periodLabel, generatedAt, generatedByRole, summary, insight, metrics, financeTruth, dbDetail, detail, data)
 */
function buildPdfKitReportFromRow(row) {
  const ft = pickFinanceTruth(row) || {};
  const m = row.metrics && typeof row.metrics === 'object' ? row.metrics : {};
  const rev = Number(ft.recognizedRevenue ?? m.recognizedRevenue ?? m.revenue ?? 0);
  const exp = Number(ft.expenses ?? m.expenses ?? 0);
  const profit = Number(ft.netRecognized ?? m.net ?? 0);
  const marginPct = rev !== 0 ? Math.round((profit / rev) * 1000) / 10 : null;

  const db = pickDbDetail(row) || {};
  const leg = row.detail && typeof row.detail === 'object' ? row.detail : {};

  const invoiceRows = firstArray(db, ['topInvoices', 'invoices', 'invoiceFocus']).length
    ? firstArray(db, ['topInvoices', 'invoices', 'invoiceFocus'])
    : firstArray(leg, ['topInvoices', 'invoices', 'invoiceFocus']);

  const bookingRows = firstArray(db, ['topBookings', 'bookings']).length
    ? firstArray(db, ['topBookings', 'bookings'])
    : firstArray(leg, ['topBookings', 'bookings']);

  const stockRows = firstArray(db, ['lowStockItems', 'stock']).length
    ? firstArray(db, ['lowStockItems', 'stock'])
    : firstArray(leg, ['lowStockItems', 'stock']);

  const insight = row.insight && typeof row.insight === 'object' ? row.insight : row.data?.insight;

  const receivables = invoiceRows.map((r) => ({
    reference: String(r.reference ?? r.ref ?? ''),
    party: String(r.party ?? r.guest ?? ''),
    dueDate: formatShortDate(r.dueDate ?? r.due),
    amount: r.amount ?? r.total,
  }));

  const topGuests = bookingRows.map((g) => ({
    name: String(g.guest ?? g.name ?? ''),
    type: String(g.type ?? ''),
    room: String(g.room ?? g.stay ?? ''),
    date: formatShortDate(g.date ?? g.checkIn ?? g.startDate),
    amount: g.amount,
  }));

  const stockAlerts = stockRows.map((s) => ({
    item: String(s.name ?? s.item ?? s.productName ?? ''),
    category: String(s.category ?? ''),
    quantity: s.quantity ?? s.qty ?? '',
    reorderLevel: s.reorderLevel ?? s.reorder ?? '',
  }));

  const risks = (insight?.risks || []).map((x) => {
    if (typeof x === 'string') return { risk: x, likelihood: '', mitigation: '' };
    return {
      risk: String(x.risk ?? x.text ?? x.body ?? x.title ?? ''),
      likelihood: String(x.likelihood ?? x.level ?? ''),
      mitigation: String(x.mitigation ?? x.note ?? ''),
    };
  });

  const recommendations = (insight?.actions || []).map((x) => {
    if (typeof x === 'string') return x;
    return {
      action: String(x.action ?? x.text ?? x.body ?? x.title ?? ''),
      priority: x.priority ?? null,
      expectedImpact: x.expectedImpact ?? x.impact ?? null,
    };
  });

  const payCollected = Number(ft.paymentsCollected ?? m.paymentsCollected ?? 0);
  const incTx = Number(ft.incomeTransactionsTotal ?? m.incomeTransactionsTotal ?? 0);
  const bookingsCount = Number(m.bookingsCount ?? m.bookingsAll ?? 0);
  const occ = m.occupancyPct != null ? `${Number(m.occupancyPct)}%` : '—';

  const sections = [];
  sections.push({
    heading: 'Period indicators',
    content: '',
    keyPoints: [],
    metrics: [
      { label: 'Recognised revenue', value: fmt(rev), trend: 'stable' },
      { label: 'Payments collected', value: fmt(payCollected), trend: 'stable' },
      { label: 'Expenses', value: fmt(exp), trend: 'stable' },
      { label: 'Net (recognised)', value: fmt(profit), trend: profit >= 0 ? 'up' : 'down' },
      { label: 'Income transactions (cash-style)', value: fmt(incTx), trend: 'stable' },
      { label: 'Bookings recorded', value: String(bookingsCount), trend: 'stable' },
      { label: 'Occupancy (reported)', value: occ, trend: 'stable' },
    ],
  });

  if (insight?.summary) {
    sections.push({
      heading: 'AI summary',
      content: insight.summary,
      keyPoints: [],
      metrics: [],
    });
  }

  const tx = firstArray(db, ['transactionsByCategory', 'transactionCategoryBreakdown']).length
    ? firstArray(db, ['transactionsByCategory', 'transactionCategoryBreakdown'])
    : firstArray(leg, ['transactionsByCategory', 'transactionCategoryBreakdown']);

  if (tx.length) {
    sections.push({
      heading: 'Income & expense by category',
      content: '',
      metrics: tx.slice(0, 12).map((t) => ({
        label: `${String(t.type ?? '')} — ${String(t.category ?? '')}`,
        value: fmt(t.total),
        trend: 'stable',
      })),
      keyPoints: [],
    });
  }

  return {
    title: String(row.title || 'Management report'),
    period: String(row.period || ''),
    periodLabel: String(row.periodLabel || ''),
    generatedAt: row.generatedAt,
    preparedFor: String(row.generatedByRole || 'admin'),
    financialSnapshot: {
      revenue: rev,
      expenses: exp,
      profit,
      marginPct,
    },
    executiveSummary: String(row.summary || ''),
    sections,
    receivables,
    topGuests,
    stockAlerts,
    risks,
    recommendations,
    outlook: '',
  };
}

function formatShortDate(value) {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

module.exports = { generatePDF, buildPdfKitReportFromRow, fmt, plainTextFromMarkdown };
