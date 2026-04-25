import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marked } from 'marked';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import ConfirmModal from '@/components/ConfirmModal';
import {
  createQuotation,
  deleteQuotation,
  getQuotationPdf,
  getQuotations,
  sendQuotationEmail,
  updateQuotation,
} from '@/api/quotations';
import { listFromSuccessEnvelope } from '@/utils/apiEnvelope';

marked.setOptions({ gfm: true, breaks: true });

function fmtMoney(value) {
  const n = Number(value) || 0;
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateInputToday() {
  return new Date().toISOString().slice(0, 10);
}

function toInputDate(value) {
  const s = String(value || '').trim();
  return s ? s.slice(0, 10) : '';
}

function quotationNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `VCQ-${yyyy}${mm}-${rand}`;
}

function emptyLineItem() {
  return { description: '', quantity: 1, unitPrice: 0 };
}

function initialForm() {
  return {
    quotationNumber: quotationNumber(),
    quotationDate: dateInputToday(),
    validUntil: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    eventType: 'Wedding',
    eventDate: '',
    venue: 'ValleyCroft Farm',
    guests: '',
    otherCharges: 0,
    notes: '',
    terms:
      '50% deposit confirms the booking. Balance due 7 days before the event date. This quotation is subject to venue and date availability.',
    lineItems: [emptyLineItem()],
  };
}

function quotationTotals(lineItems, otherChargesValue) {
  const subtotal = lineItems.reduce((sum, line) => {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const unit = Math.max(0, Number(line.unitPrice) || 0);
    return sum + qty * unit;
  }, 0);
  const otherCharges = Math.max(0, Number(otherChargesValue) || 0);
  const total = subtotal + otherCharges;
  return { subtotal, otherCharges, total };
}

function escapeMarkdown(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\r?\n/g, '<br/>');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeQuote(raw) {
  const lineItemsRaw = Array.isArray(raw?.lineItems) ? raw.lineItems : [];
  const lineItems = lineItemsRaw.map((line) => ({
    description: String(line?.description || line?.name || ''),
    quantity: Math.max(0, Number(line?.quantity || line?.qty || 0)),
    unitPrice: Math.max(0, Number(line?.unitPrice || line?.rate || line?.price || 0)),
  }));
  const subtotalFromLines = lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const otherChargesLine = lineItems.find((line) => String(line.description || '').toLowerCase() === 'other charges');
  const subtotal = Number(raw?.subtotal ?? subtotalFromLines) || 0;
  const otherCharges = Number(raw?.otherCharges ?? (otherChargesLine ? otherChargesLine.unitPrice * otherChargesLine.quantity : 0)) || 0;
  const total = Number(raw?.total ?? subtotal + otherCharges) || 0;
  return {
    id: String(raw?._id ?? raw?.id ?? ''),
    quotationNumber: String(raw?.quotationNumber ?? raw?.quoteNumber ?? raw?.number ?? ''),
    quotationDate: raw?.quotationDate ?? raw?.createdAt ?? '',
    validUntil: raw?.validUntil ?? raw?.expiryDate ?? '',
    clientName: raw?.clientName ?? raw?.client?.name ?? '',
    clientEmail: raw?.clientEmail ?? raw?.client?.email ?? '',
    clientPhone: raw?.clientPhone ?? raw?.client?.phone ?? '',
    eventType: raw?.eventType ?? raw?.event?.type ?? '',
    eventDate: raw?.eventDate ?? raw?.event?.date ?? '',
    venue: raw?.venue ?? raw?.event?.venue ?? '',
    guests: raw?.guests ?? raw?.event?.guests ?? '',
    notes: raw?.notes ?? '',
    terms: raw?.terms ?? '',
    status: String(raw?.status || 'draft').toLowerCase(),
    lineItems,
    subtotal,
    otherCharges,
    total,
    _raw: raw,
  };
}

function buildQuotationHtml(quote) {
  const lineRows = quote.lineItems
    .map((line) => {
      const qty = Math.max(0, Number(line.quantity) || 0);
      const unit = Math.max(0, Number(line.unitPrice) || 0);
      const amount = qty * unit;
      return `| ${escapeMarkdown(line.description || '—')} | ${qty} | ${fmtMoney(unit)} | ${fmtMoney(amount)} |`;
    })
    .join('\n');

  const detailsBlock = `
<div class="q-two-col">
  <section class="q-card">
    <h3>Client Details</h3>
    <p><strong>Client:</strong> ${escapeHtml(quote.clientName || '—')}</p>
    <p><strong>Email:</strong> ${escapeHtml(quote.clientEmail || '—')}</p>
    <p><strong>Phone:</strong> ${escapeHtml(quote.clientPhone || '—')}</p>
  </section>
  <section class="q-card">
    <h3>Event Details</h3>
    <p><strong>Event:</strong> ${escapeHtml(quote.eventType || '—')}</p>
    <p><strong>Date:</strong> ${escapeHtml(toInputDate(quote.eventDate) || '—')}</p>
    <p><strong>Venue:</strong> ${escapeHtml(quote.venue || '—')}</p>
    <p><strong>Guests:</strong> ${escapeHtml(quote.guests || '—')}</p>
    <p><strong>Quoted on:</strong> ${escapeHtml(toInputDate(quote.quotationDate) || '—')}</p>
    <p><strong>Valid until:</strong> ${escapeHtml(toInputDate(quote.validUntil) || '—')}</p>
  </section>
</div>`;

  const notesTermsBlock = `
<div class="q-two-col q-two-col--bottom">
  <section class="q-card">
    <h3>Notes</h3>
    <p>${escapeHtml(quote.notes || '—')}</p>
  </section>
  <section class="q-card">
    <h3>Terms</h3>
    <p>${escapeHtml(quote.terms || '—')}</p>
  </section>
</div>`;

  const markdown = `
# ValleyCroft
## Agro-Tourism Event Quotation

> **Quotation:** ${escapeMarkdown(quote.quotationNumber)}

${detailsBlock}

### Line Items
| Description | Qty | Unit Price | Amount |
| --- | ---: | ---: | ---: |
${lineRows || '| — | 0 | R 0.00 | R 0.00 |'}

### Totals
- **Subtotal:** ${fmtMoney(quote.subtotal)}
- **Other charges:** ${fmtMoney(quote.otherCharges)}
- **Total:** ${fmtMoney(quote.total)}

${notesTermsBlock}
`;

  const renderedMarkdown = marked.parse(markdown);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${quote.quotationNumber} - ValleyCroft Quotation</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 14px; color: #1f2937; background: #fafaf8; }
      .quotation-doc { max-width: 860px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; }
      h1 { color:#1e3610; margin: 0 0 2px; font-size: 26px; line-height: 1.15; }
      h2 { color:#4b5563; margin: 0 0 12px; font-size: 14px; font-weight: 600; }
      h3 { color:#111827; margin: 16px 0 8px; font-size: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
      p, li { font-size: 12px; line-height: 1.45; margin: 4px 0; }
      ul { margin: 6px 0 8px 16px; padding: 0; }
      blockquote { margin: 0 0 10px; padding: 8px 10px; background:#1e3610; color:#fff; border-radius:8px; border: none; font-size: 12px; }
      .q-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
      .q-two-col--bottom { margin-top: 12px; }
      .q-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; background: #fcfcfa; min-width: 0; }
      .q-card h3 { border: none; margin: 0 0 6px; padding: 0; font-size: 13px; }
      .q-card p { margin: 4px 0; }
      table { width:100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border-bottom:1px solid #e5e7eb; padding:7px 6px; font-size: 12px; }
      th { background:#f3f4f6; text-align:left; font-weight:600; }
      th:nth-child(2), th:nth-child(3), th:nth-child(4),
      td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
      @media (max-width: 760px) { .q-two-col { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="quotation-doc">
      ${renderedMarkdown}
    </div>
  </body>
</html>`;
}

export default function QuotationsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => initialForm());
  const [createOpen, setCreateOpen] = useState(false);
  const [previewQuote, setPreviewQuote] = useState(null);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');
  const [emailStatusBox, setEmailStatusBox] = useState({ type: '', message: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const quotationsQuery = useQuery({
    queryKey: ['quotations'],
    queryFn: () => getQuotations({ page: 1, limit: 200 }),
  });

  const quotes = useMemo(
    () => listFromSuccessEnvelope(quotationsQuery.data).map(normalizeQuote).filter((q) => q.id),
    [quotationsQuery.data]
  );

  const filteredQuotes = useMemo(() => {
    let rows = quotes;
    if (monthFilter) {
      rows = rows.filter((q) => {
        const m = String(q.eventDate || q.quotationDate || '').slice(0, 7);
        if (!m) return true;
        return m === monthFilter;
      });
    }
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        String(row.quotationNumber || '').toLowerCase().includes(q) ||
        String(row.clientName || '').toLowerCase().includes(q) ||
        String(row.eventType || '').toLowerCase().includes(q) ||
        String(row.venue || '').toLowerCase().includes(q) ||
        String(row.status || '').toLowerCase().includes(q)
    );
  }, [quotes, search, monthFilter]);

  const formTotals = useMemo(
    () => quotationTotals(form.lineItems, form.otherCharges),
    [form.lineItems, form.otherCharges]
  );

  const createMutation = useMutation({
    mutationFn: (body) => createQuotation(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteQuotation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateQuotation(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: ({ id, email }) => sendQuotationEmail(id, email ? { email } : {}),
  });

  const handleCreateQuotation = async (e) => {
    e.preventDefault();
    const preparedLines = form.lineItems
      .filter((x) => String(x.description || '').trim())
      .map((line) => ({
        description: String(line.description || '').trim(),
        quantity: Math.max(1, Number(line.quantity) || 1),
        unitPrice: Math.max(0, Number(line.unitPrice) || 0),
      }));
    if ((Number(form.otherCharges) || 0) > 0) {
      preparedLines.push({
        description: 'Other charges',
        quantity: 1,
        unitPrice: Math.max(0, Number(form.otherCharges) || 0),
      });
    }

    const payload = {
      quotationNumber: form.quotationNumber || undefined,
      quotationDate: form.quotationDate || undefined,
      validUntil: form.validUntil || undefined,
      clientName: form.clientName,
      clientEmail: form.clientEmail,
      clientPhone: form.clientPhone,
      eventType: form.eventType,
      eventDate: form.eventDate,
      venue: form.venue,
      guests: Number(form.guests) || undefined,
      notes: form.notes || '',
      terms: form.terms || '',
      status: 'draft',
      lineItems: preparedLines,
      otherCharges: Math.max(0, Number(form.otherCharges) || 0),
      tax: 0,
      taxRate: 0,
    };
    const created = await createMutation.mutateAsync(payload);
    const id = String(created?.data?._id ?? created?._id ?? '');
    if (id) {
      // Keep preview closed unless user explicitly clicks Preview.
      setPreviewQuote(null);
    }
    setForm(initialForm());
    setCreateOpen(false);
  };

  const updateLineItem = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.lineItems];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, lineItems: next };
    });
  };

  const addLine = () => setForm((prev) => ({ ...prev, lineItems: [...prev.lineItems, emptyLineItem()] }));

  const removeLine = (index) =>
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.length <= 1 ? prev.lineItems : prev.lineItems.filter((_, i) => i !== index),
    }));

  const openPrintWindow = (quote) => {
    const html = buildQuotationHtml(quote);
    const w = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const downloadHtml = (quote) => {
    const html = buildQuotationHtml(quote);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quote.quotationNumber}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sendByEmail = useCallback(async (quote) => {
    if (!quote?.id) return;
    setActionBusyId(quote.id);
    try {
      await sendEmailMutation.mutateAsync({ id: quote.id, email: quote.clientEmail });
      setEmailStatusBox({
        type: 'success',
        message: `Quotation ${quote.quotationNumber || ''} email sent successfully${quote.clientEmail ? ` to ${quote.clientEmail}` : ''}.`,
      });
    } catch (err) {
      setEmailStatusBox({
        type: 'error',
        message: err?.message || 'Could not send quotation email.',
      });
    } finally {
      setActionBusyId('');
    }
  }, [sendEmailMutation]);

  useEffect(() => {
    if (!emailStatusBox.message) return undefined;
    const t = window.setTimeout(() => {
      setEmailStatusBox({ type: '', message: '' });
    }, 3500);
    return () => window.clearTimeout(t);
  }, [emailStatusBox]);

  const downloadPdf = useCallback(async (quote) => {
    if (!quote?.id) return;
    setActionBusyId(quote.id);
    try {
      // Primary: real backend PDF file download.
      const res = await getQuotationPdf(quote.id);
      const blob = res?.data ?? res;
      if (blob instanceof Blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${quote.quotationNumber || quote.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      // Fallback: print the markdown-rendered document.
      openPrintWindow(quote);
    } catch {
      // If API download fails, still allow user to export via print dialog.
      openPrintWindow(quote);
    } finally {
      setActionBusyId('');
    }
  }, [openPrintWindow]);

  const updateStatus = useCallback(async (quote, status) => {
    if (!quote?.id) return;
    setActionBusyId(quote.id);
    try {
      await statusMutation.mutateAsync({ id: quote.id, status });
    } finally {
      setActionBusyId('');
    }
  }, [statusMutation]);

  const removeQuote = useCallback((id, label) => {
    setDeleteTarget({ id, label: label || 'this quotation' });
  }, []);

  const confirmDeleteQuote = useCallback(async () => {
    const id = String(deleteTarget?.id || '').trim();
    if (!id) return;
    setActionBusyId(id);
    try {
      await deleteMutation.mutateAsync(id);
      if (previewQuote?.id === id) setPreviewQuote(null);
      setDeleteTarget(null);
    } finally {
      setActionBusyId('');
    }
  }, [deleteMutation, deleteTarget, previewQuote]);

  const sendWhatsApp = (quote) => {
    const text =
      `${quote.quotationNumber}\n` +
      `Client: ${quote.clientName}\n` +
      `Event: ${quote.eventType}\n` +
      `Total: ${fmtMoney(quote.total)}\n` +
      `Valid Until: ${toInputDate(quote.validUntil) || 'N/A'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Event quotations</div>
          <div className="page-subtitle">Create professional event quotations for admin, then download/print or send by email.</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <i className="fas fa-plus" aria-hidden /> New quotation
        </button>
      </div>

      {quotationsQuery.error ? (
        <div className="card card--error"><div className="card-body">{quotationsQuery.error.message}</div></div>
      ) : null}
      {emailStatusBox.message ? (
        <div
          className="card"
          style={{
            border: emailStatusBox.type === 'success' ? '1px solid #b7e4c7' : '1px solid #f5c2c7',
            background: emailStatusBox.type === 'success' ? '#edfdf2' : '#fff4f4',
            marginBottom: 12,
          }}
        >
          <div className="card-body" style={{ color: emailStatusBox.type === 'success' ? '#14532d' : '#991b1b' }}>
            {emailStatusBox.message}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-body">
          <DashboardListFilters
            embedded
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search quotation, client, event, status…"
            month={monthFilter}
            onMonthChange={setMonthFilter}
          />
        </div>
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Quotation</th>
                  <th>Client</th>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="statement-table-num">Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotationsQuery.isPending ? (
                  <tr><td colSpan={7}>Loading quotations…</td></tr>
                ) : null}
                {!quotationsQuery.isPending && filteredQuotes.length === 0 ? (
                  <tr><td colSpan={7}>No quotations yet.</td></tr>
                ) : (
                  filteredQuotes.map((q) => (
                    <tr key={q.id}>
                      <td><strong>{q.quotationNumber}</strong></td>
                      <td>{q.clientName || '—'}</td>
                      <td>{q.eventType || '—'}</td>
                      <td>{toInputDate(q.eventDate || q.quotationDate)}</td>
                      <td>
                        <select
                          className="form-control"
                          style={{ maxWidth: 140 }}
                          value={q.status || 'draft'}
                          onChange={(e) => updateStatus(q, e.target.value)}
                          disabled={actionBusyId === q.id}
                        >
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="expired">Expired</option>
                        </select>
                      </td>
                      <td className="statement-table-num">{fmtMoney(q.total)}</td>
                      <td>
                        <div className="transactions-table-actions">
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadPdf(q)} disabled={actionBusyId === q.id}>Download PDF</button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => sendByEmail(q)} disabled={actionBusyId === q.id}>Send Email</button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => sendWhatsApp(q)}>WhatsApp</button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewQuote(q)}>Preview</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {previewQuote ? (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quotation-preview-modal-title"
          onClick={() => setPreviewQuote(null)}
        >
          <div
            className="transactions-modal"
            style={{ width: '75vw', maxWidth: 1500, maxHeight: '94vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="transactions-modal-header">
              <h3 id="quotation-preview-modal-title">Quotation preview</h3>
              <button type="button" className="transactions-modal-close" onClick={() => setPreviewQuote(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <iframe
                title="Quotation preview"
                style={{ width: '100%', minHeight: 620, maxHeight: '76vh', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff' }}
                srcDoc={buildQuotationHtml(previewQuote)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="transactions-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="quotation-create-modal-title" onClick={() => setCreateOpen(false)}>
          <div className="transactions-modal" style={{ width: 'min(1100px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="quotation-create-modal-title">Create quotation</h3>
              <button type="button" className="transactions-modal-close" onClick={() => setCreateOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form className="form-stack" onSubmit={handleCreateQuotation}>
                <p className="chart-of-accounts-api-note">Fields marked with * are required.</p>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field">
                    <label>Quotation number *</label>
                    <input className="form-control" value={form.quotationNumber} onChange={(e) => setForm((f) => ({ ...f, quotationNumber: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Quotation date *</label>
                    <input type="date" className="form-control" value={form.quotationDate} onChange={(e) => setForm((f) => ({ ...f, quotationDate: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Valid until *</label>
                    <input type="date" className="form-control" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Client name *</label>
                    <input className="form-control" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Client email *</label>
                    <input type="email" className="form-control" value={form.clientEmail} onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Client phone *</label>
                    <input className="form-control" value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Event type *</label>
                    <input className="form-control" value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Event date *</label>
                    <input type="date" className="form-control" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Venue *</label>
                    <input className="form-control" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} required />
                  </div>
                  <div className="transactions-form-field">
                    <label>Guest count *</label>
                    <input type="number" min="1" className="form-control" value={form.guests} onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))} required />
                  </div>
                </div>

                <div className="statement-table-wrap" style={{ marginTop: 14 }}>
                  <table className="statement-table">
                    <thead>
                      <tr>
                        <th>Description *</th>
                        <th>Qty *</th>
                        <th>Unit price *</th>
                        <th className="statement-table-num">Amount</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {form.lineItems.map((line, i) => {
                        const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                        return (
                          <tr key={`line-${i}`}>
                            <td><input className="form-control" placeholder="e.g. Venue hire" value={line.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} required /></td>
                            <td><input type="number" min="1" className="form-control" value={line.quantity} onChange={(e) => updateLineItem(i, 'quantity', e.target.value)} required /></td>
                            <td><input type="number" min="0" step="0.01" className="form-control" value={line.unitPrice} onChange={(e) => updateLineItem(i, 'unitPrice', e.target.value)} required /></td>
                            <td className="statement-table-num"><strong>{fmtMoney(amount)}</strong></td>
                            <td>
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => removeLine(i)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="transactions-table-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={addLine}>
                    <i className="fas fa-plus" aria-hidden /> Add line
                  </button>
                </div>

                <div className="transactions-form-grid" style={{ marginTop: 14 }}>
                  <div className="transactions-form-field">
                    <label>Other charges</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={form.otherCharges}
                      onChange={(e) => setForm((f) => ({ ...f, otherCharges: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label>Notes</label>
                    <textarea className="form-control" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label>Terms *</label>
                    <textarea className="form-control" rows={3} value={form.terms} onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))} required />
                  </div>
                </div>

                <div className="card" style={{ marginTop: 14 }}>
                  <div className="card-body" style={{ display: 'grid', gap: 6 }}>
                    <div>Subtotal: <strong>{fmtMoney(formTotals.subtotal)}</strong></div>
                    <div>Other charges: <strong>{fmtMoney(formTotals.otherCharges)}</strong></div>
                    <div>Total: <strong>{fmtMoney(formTotals.total)}</strong></div>
                  </div>
                </div>

                <div className="transactions-modal-actions" style={{ marginTop: 14 }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={createMutation.isPending}>
                    <i className="fas fa-file-signature" aria-hidden /> {createMutation.isPending ? 'Saving…' : 'Create quotation'}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm(initialForm())}>
                    Reset
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete quotation"
        message={`Delete "${deleteTarget?.label || 'this quotation'}"? This action cannot be undone.`}
        confirmLabel="Delete quotation"
        onConfirm={confirmDeleteQuote}
        onCancel={() => setDeleteTarget(null)}
        busy={deleteMutation.isPending}
        tone="danger"
      />
    </div>
  );
}

