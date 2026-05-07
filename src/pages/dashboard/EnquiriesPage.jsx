import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getQuotations } from '@/api/quotations';
import {
  closeEnquiry,
  extractEnquiriesListMeta,
  getEnquiries,
  getEnquiryById,
  respondToEnquiry,
} from '@/api/enquiries';
import ConfirmModal from '@/components/ConfirmModal';
import { listFromSuccessEnvelope } from '@/utils/apiEnvelope';
import './EnquiriesPage.css';

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'responded', label: 'Responded' },
  { value: 'closed', label: 'Closed' },
];

function emptyLine() {
  return { description: '', quantity: 1, unitPrice: 0 };
}

/** Backend may send quotationId as ObjectId string or populated quotation document */
function resolveQuotationRef(rawRef) {
  if (rawRef == null) return { id: '', populated: null };
  if (typeof rawRef === 'object' && !Array.isArray(rawRef)) {
    const id = String(rawRef._id ?? rawRef.id ?? '').trim();
    return { id, populated: id ? rawRef : null };
  }
  const id = String(rawRef).trim();
  return { id, populated: null };
}

function normalizeEnquiry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const qRef = resolveQuotationRef(raw.quotationId);
  return {
    id: String(raw._id ?? raw.id ?? ''),
    status: String(raw.status || 'new').toLowerCase(),
    name: String(raw.guestName ?? raw.name ?? raw.guest?.name ?? '').trim(),
    email: String(raw.guestEmail ?? raw.email ?? raw.guest?.email ?? '').trim(),
    phone: String(raw.guestPhone ?? raw.phone ?? raw.guest?.phone ?? '').trim(),
    eventType: String(raw.eventType ?? raw.event?.type ?? '').trim(),
    eventDate: String(raw.eventDate ?? raw.event?.date ?? '').trim(),
    guestCount: raw.guestCount ?? raw.guests ?? raw.event?.guestCount ?? '',
    message: String(raw.message ?? raw.details ?? raw.body ?? '').trim(),
    quotationId: qRef.id,
    linkedQuotation: qRef.populated,
    subject: String(raw.subject ?? '').trim(),
    createdAt: raw.createdAt ?? raw.created_at ?? '',
    updatedAt: raw.updatedAt ?? raw.updated_at ?? '',
    respondedAt: raw.respondedAt ?? raw.responded_at ?? '',
    respondedBy: raw.respondedBy != null ? String(raw.respondedBy) : '',
    responseMessage: String(raw.responseMessage ?? raw.adminResponse?.message ?? '').trim(),
    adminNotes: String(raw.adminNotes ?? raw.adminResponse?.notes ?? '').trim(),
    _raw: raw,
  };
}

function unwrapDetail(payload) {
  if (payload == null) return { enquiry: null, quotation: null };
  if (typeof payload !== 'object') return { enquiry: null, quotation: null };
  const e = payload.enquiry ?? payload.data ?? payload;
  const enquiry = normalizeEnquiry(e);
  let q = payload.quotation ?? payload.linkedQuotation ?? e?.quotation ?? null;
  if (!q && enquiry?.linkedQuotation) q = enquiry.linkedQuotation;
  return { enquiry, quotation: q };
}

function formatDate(value) {
  const s = String(value || '').trim();
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 16);
  return d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'new') return 'enquiries-badge enquiries-badge--new';
  if (s === 'responded') return 'enquiries-badge enquiries-badge--responded';
  if (s === 'closed') return 'enquiries-badge enquiries-badge--closed';
  return 'enquiries-badge';
}

export default function EnquiriesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  /** CEO dashboards are view-only: CEOs can view enquiries but not respond/close. */
  const canRespondOrClose = role === 'admin' || role === 'finance';

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);

  const [respondOpen, setRespondOpen] = useState(false);
  const [responseMessage, setResponseMessage] = useState(
    'Thank you for your enquiry. Please find your quotation attached.'
  );
  const [adminNotes, setAdminNotes] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [emailTo, setEmailTo] = useState('');
  const [quotationMode, setQuotationMode] = useState('existing');
  const [existingQuotationId, setExistingQuotationId] = useState('');
  const [qEventType, setQEventType] = useState('Wedding');
  const [qEventDate, setQEventDate] = useState('');
  const [qGuestCount, setQGuestCount] = useState('');
  const [qCurrency, setQCurrency] = useState('ZAR');
  const [qTax, setQTax] = useState('0');
  const [qNotes, setQNotes] = useState('');
  const [qTerms, setQTerms] = useState('50% deposit confirms the booking. Balance due before the event date.');
  const [lineItems, setLineItems] = useState([emptyLine(), emptyLine()]);
  const [respondError, setRespondError] = useState(null);

  const listQuery = useQuery({
    queryKey: ['enquiries', page, statusFilter, LIMIT],
    queryFn: async () => {
      const raw = await getEnquiries({
        page,
        limit: LIMIT,
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const { list, meta } = extractEnquiriesListMeta(raw);
      return { list: list.map((row) => normalizeEnquiry(row)).filter(Boolean), meta };
    },
  });

  const detailQuery = useQuery({
    queryKey: ['enquiry', detailId],
    queryFn: async () => {
      const raw = await getEnquiryById(detailId);
      return unwrapDetail(raw);
    },
    enabled: Boolean(detailId),
  });

  const quotationsQuery = useQuery({
    queryKey: ['quotations', 'enquiry-picker'],
    queryFn: async () => {
      const raw = await getQuotations({ limit: 200 });
      return listFromSuccessEnvelope(raw);
    },
    enabled: respondOpen && quotationMode === 'existing',
  });

  const enquiry = detailQuery.data?.enquiry;
  const linkedQuotation = detailQuery.data?.quotation ?? enquiry?.linkedQuotation ?? null;

  useEffect(() => {
    if (!respondOpen || !enquiry) return;
    setEmailTo(enquiry.email || '');
    setQEventType(enquiry.eventType || 'Wedding');
    setQEventDate(String(enquiry.eventDate || '').slice(0, 10));
    setQGuestCount(enquiry.guestCount != null && enquiry.guestCount !== '' ? String(enquiry.guestCount) : '');
  }, [respondOpen, enquiry?.id]);

  const filteredRows = useMemo(() => {
    const rows = listQuery.data?.list ?? [];
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q) ||
        r.eventType.toLowerCase().includes(q)
    );
  }, [listQuery.data, search]);

  const meta = listQuery.data?.meta ?? {};
  const total = Number(meta.total) || 0;
  const totalPages = Math.max(1, Number(meta.totalPages) || Math.ceil(total / LIMIT) || 1);

  const invalidateList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['enquiries'] });
  }, [queryClient]);

  const closeMutation = useMutation({
    mutationFn: (id) => closeEnquiry(id),
    onSuccess: () => {
      invalidateList();
      setCloseTarget(null);
      setDetailId(null);
    },
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, body }) => respondToEnquiry(id, body),
    onSuccess: () => {
      invalidateList();
      queryClient.invalidateQueries({ queryKey: ['enquiry', detailId] });
      setRespondOpen(false);
      setRespondError(null);
    },
    onError: (err) => {
      setRespondError(err?.message || 'Could not send response.');
    },
  });

  const openDetail = (id) => {
    setDetailId(id);
    setRespondOpen(false);
    setRespondError(null);
  };

  const closeDetail = () => {
    setDetailId(null);
    setRespondOpen(false);
    setRespondError(null);
  };

  const openRespond = () => {
    setRespondError(null);
    setRespondOpen(true);
    setQuotationMode('existing');
    setExistingQuotationId(enquiry?.quotationId || '');
    setLineItems([emptyLine(), emptyLine()]);
  };

  const updateLine = (index, key, value) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const addLine = () => setLineItems((prev) => [...prev, emptyLine()]);
  const removeLine = (index) =>
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  function buildRespondBody() {
    const base = {
      responseMessage: responseMessage.trim(),
      adminNotes: adminNotes.trim() || undefined,
      sendEmail,
      ...(emailTo.trim() ? { to: emailTo.trim() } : {}),
    };
    if (quotationMode === 'existing') {
      const id = existingQuotationId.trim();
      if (!id) throw new Error('Choose an existing quotation or switch to “Create quotation”.');
      return { ...base, quotationId: id };
    }
    const lines = lineItems
      .filter((l) => String(l.description || '').trim())
      .map((l) => ({
        description: String(l.description).trim(),
        qty: Math.max(1, Number(l.quantity) || 1),
        unitPrice: Math.max(0, Number(l.unitPrice) || 0),
      }));
    if (!lines.length) throw new Error('Add at least one line item for the new quotation.');
    return {
      ...base,
      quotation: {
        eventType: qEventType.trim() || 'Event',
        eventDate: qEventDate.trim() || undefined,
        guestCount: qGuestCount.trim() ? Number(qGuestCount) : undefined,
        currency: qCurrency.trim() || 'ZAR',
        lineItems: lines,
        tax: Number(qTax) || 0,
        notes: qNotes.trim() || undefined,
        terms: qTerms.trim() || undefined,
        clientName: enquiry?.name,
        clientEmail: enquiry?.email,
        clientPhone: enquiry?.phone || undefined,
      },
    };
  }

  function handleRespondSubmit(e) {
    e.preventDefault();
    if (!detailId || !enquiry) return;
    setRespondError(null);
    try {
      const body = buildRespondBody();
      respondMutation.mutate({ id: detailId, body });
    } catch (ve) {
      setRespondError(ve?.message || 'Check the form.');
    }
  }

  const quoteOptions = useMemo(() => {
    const raw = quotationsQuery.data || [];
    return raw
      .map((q) => ({
        id: String(q._id ?? q.id ?? ''),
        label: `${q.quotationNumber || q.quoteNumber || q.number || 'Quote'} — ${q.clientName || 'Client'}`,
      }))
      .filter((o) => o.id);
  }, [quotationsQuery.data]);

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Event enquiries</div>
          <div className="page-subtitle">
            Guest submissions from the public enquiry form. Open a row to view details; admins and finance can send a
            quotation email (PDF) and close threads when done.
          </div>
        </div>
      </div>

      {listQuery.error ? (
        <div className="card card--error">
          <div className="card-body">{listQuery.error.message}</div>
        </div>
      ) : null}

      <div
        className="bookings-filters-bar"
        style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>Status</span>
          <select
            className="form-control"
            style={{ minWidth: 160 }}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          className="form-control"
          placeholder="Search name, email, message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Guest</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {listQuery.isPending ? (
                  <tr>
                    <td colSpan={5}>Loading enquiries…</td>
                  </tr>
                ) : null}
                {!listQuery.isPending && filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No enquiries match the current filters.</td>
                  </tr>
                ) : null}
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.email || '—'}</div>
                    </td>
                    <td>
                      <div>{row.eventType || '—'}</div>
                      {row.eventDate ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(row.eventDate)}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={statusBadgeClass(row.status)}>{row.status}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => openDetail(row.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Page {page} of {totalPages}
            {total ? ` · ${total} total` : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {detailId ? (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enquiry-detail-title"
          onClick={closeDetail}
        >
          <div className="transactions-modal enquiries-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="enquiry-detail-title">Enquiry detail</h3>
              <button type="button" className="transactions-modal-close" onClick={closeDetail} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              {detailQuery.isPending ? (
                <p className="text-sm text-[#3D4F2A]">Loading…</p>
              ) : detailQuery.error ? (
                <div className="card card--error">
                  <div className="card-body">{detailQuery.error.message}</div>
                </div>
              ) : enquiry ? (
                <>
                  <div className="enquiries-detail-grid">
                    <div>
                      <div className="enquiries-detail-label">Status</div>
                      <div>
                        <span className={statusBadgeClass(enquiry.status)}>{enquiry.status}</span>
                      </div>
                    </div>
                    <div>
                      <div className="enquiries-detail-label">Received</div>
                      <div>{formatDate(enquiry.createdAt)}</div>
                    </div>
                    {enquiry.subject ? (
                      <div className="enquiries-detail-span2">
                        <div className="enquiries-detail-label">Subject</div>
                        <div>{enquiry.subject}</div>
                      </div>
                    ) : null}
                    {enquiry.respondedAt ? (
                      <div>
                        <div className="enquiries-detail-label">Responded</div>
                        <div>{formatDate(enquiry.respondedAt)}</div>
                      </div>
                    ) : null}
                    <div>
                      <div className="enquiries-detail-label">Name</div>
                      <div>{enquiry.name || '—'}</div>
                    </div>
                    <div>
                      <div className="enquiries-detail-label">Email</div>
                      <div>{enquiry.email || '—'}</div>
                    </div>
                    <div>
                      <div className="enquiries-detail-label">Phone</div>
                      <div>{enquiry.phone || '—'}</div>
                    </div>
                    <div>
                      <div className="enquiries-detail-label">Event type</div>
                      <div>{enquiry.eventType || '—'}</div>
                    </div>
                    <div>
                      <div className="enquiries-detail-label">Event date</div>
                      <div>{enquiry.eventDate ? formatDate(enquiry.eventDate) : '—'}</div>
                    </div>
                    <div>
                      <div className="enquiries-detail-label">Guests</div>
                      <div>{enquiry.guestCount !== '' && enquiry.guestCount != null ? String(enquiry.guestCount) : '—'}</div>
                    </div>
                    <div className="enquiries-detail-span2">
                      <div className="enquiries-detail-label">Message</div>
                      <div className="enquiries-detail-message">{enquiry.message || '—'}</div>
                    </div>
                    {enquiry.responseMessage ? (
                      <div className="enquiries-detail-span2">
                        <div className="enquiries-detail-label">Last response message</div>
                        <div className="enquiries-detail-message">{enquiry.responseMessage}</div>
                      </div>
                    ) : null}
                    {enquiry.adminNotes ? (
                      <div className="enquiries-detail-span2">
                        <div className="enquiries-detail-label">Admin notes</div>
                        <div className="enquiries-detail-message">{enquiry.adminNotes}</div>
                      </div>
                    ) : null}
                    {enquiry.quotationId || linkedQuotation ? (
                      <div className="enquiries-detail-span2">
                        <div className="enquiries-detail-label">Linked quotation</div>
                        <div>
                          <strong>{linkedQuotation?.quotationNumber || 'Quotation'}</strong>
                          {linkedQuotation?.status ? (
                            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                              {linkedQuotation.status}
                            </span>
                          ) : null}
                          {linkedQuotation?.total != null && !Number.isNaN(Number(linkedQuotation.total)) ? (
                            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                              Total R {Number(linkedQuotation.total).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : null}
                          {enquiry.quotationId ? (
                            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                              ID: {enquiry.quotationId}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {!respondOpen && canRespondOrClose && enquiry.status !== 'closed' ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={openRespond}>
                        Respond with quotation
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setCloseTarget({ id: enquiry.id, name: enquiry.name })}>
                        Close enquiry
                      </button>
                    </div>
                  ) : null}

                  {respondOpen && canRespondOrClose ? (
                    <form onSubmit={handleRespondSubmit} style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                      <h4 className="enquiries-respond-heading">Send quotation response</h4>
                      <div className="transactions-form-grid">
                        <div className="transactions-form-field transactions-form-field--wide">
                          <label htmlFor="enq-resp-msg">Email message to guest</label>
                          <textarea
                            id="enq-resp-msg"
                            className="form-control"
                            rows={3}
                            value={responseMessage}
                            onChange={(e) => setResponseMessage(e.target.value)}
                            required
                          />
                        </div>
                        <div className="transactions-form-field transactions-form-field--wide">
                          <label htmlFor="enq-admin-notes">Internal admin notes (optional)</label>
                          <textarea
                            id="enq-admin-notes"
                            className="form-control"
                            rows={2}
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                          />
                        </div>
                        <div className="transactions-form-field">
                          <label htmlFor="enq-email-to">Send to (optional)</label>
                          <input
                            id="enq-email-to"
                            type="email"
                            className="form-control"
                            value={emailTo}
                            onChange={(e) => setEmailTo(e.target.value)}
                            placeholder={enquiry.email || 'Guest email'}
                          />
                        </div>
                        <div className="transactions-form-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            id="enq-send-email"
                            type="checkbox"
                            checked={sendEmail}
                            onChange={(e) => setSendEmail(e.target.checked)}
                          />
                          <label htmlFor="enq-send-email" style={{ margin: 0, fontWeight: 500 }}>
                            Send email with PDF
                          </label>
                        </div>
                        <div className="transactions-form-field transactions-form-field--wide">
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Quotation</span>
                          <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="radio"
                                name="qmode"
                                checked={quotationMode === 'existing'}
                                onChange={() => setQuotationMode('existing')}
                              />
                              Existing quotation
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="radio"
                                name="qmode"
                                checked={quotationMode === 'new'}
                                onChange={() => setQuotationMode('new')}
                              />
                              Create quotation
                            </label>
                          </div>
                        </div>
                        {quotationMode === 'existing' ? (
                          <div className="transactions-form-field transactions-form-field--wide">
                            <label htmlFor="enq-q-id">Quotation</label>
                            <select
                              id="enq-q-id"
                              className="form-control"
                              value={existingQuotationId}
                              onChange={(e) => setExistingQuotationId(e.target.value)}
                              required={quotationMode === 'existing'}
                            >
                              <option value="">Select…</option>
                              {quoteOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <>
                            <div className="transactions-form-field">
                              <label htmlFor="enq-q-et">Event type</label>
                              <input
                                id="enq-q-et"
                                className="form-control"
                                value={qEventType}
                                onChange={(e) => setQEventType(e.target.value)}
                              />
                            </div>
                            <div className="transactions-form-field">
                              <label htmlFor="enq-q-ed">Event date</label>
                              <input
                                id="enq-q-ed"
                                type="date"
                                className="form-control"
                                value={qEventDate}
                                onChange={(e) => setQEventDate(e.target.value)}
                              />
                            </div>
                            <div className="transactions-form-field">
                              <label htmlFor="enq-q-gc">Guest count</label>
                              <input
                                id="enq-q-gc"
                                type="number"
                                min={0}
                                className="form-control"
                                value={qGuestCount}
                                onChange={(e) => setQGuestCount(e.target.value)}
                              />
                            </div>
                            <div className="transactions-form-field">
                              <label htmlFor="enq-q-cur">Currency</label>
                              <input
                                id="enq-q-cur"
                                className="form-control"
                                value={qCurrency}
                                onChange={(e) => setQCurrency(e.target.value)}
                              />
                            </div>
                            <div className="transactions-form-field">
                              <label htmlFor="enq-q-tax">Tax</label>
                              <input
                                id="enq-q-tax"
                                type="number"
                                min={0}
                                step="0.01"
                                className="form-control"
                                value={qTax}
                                onChange={(e) => setQTax(e.target.value)}
                              />
                            </div>
                            <div className="transactions-form-field transactions-form-field--wide">
                              <label htmlFor="enq-q-notes">Quotation notes</label>
                              <textarea
                                id="enq-q-notes"
                                className="form-control"
                                rows={2}
                                value={qNotes}
                                onChange={(e) => setQNotes(e.target.value)}
                              />
                            </div>
                            <div className="transactions-form-field transactions-form-field--wide">
                              <label htmlFor="enq-q-terms">Terms</label>
                              <textarea
                                id="enq-q-terms"
                                className="form-control"
                                rows={2}
                                value={qTerms}
                                onChange={(e) => setQTerms(e.target.value)}
                              />
                            </div>
                            <div className="transactions-form-field transactions-form-field--wide">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ margin: 0 }}>Line items</label>
                                <button type="button" className="btn btn-outline btn-sm" onClick={addLine}>
                                  Add line
                                </button>
                              </div>
                              <div className="enquiries-lines-wrap">
                                {lineItems.map((line, idx) => (
                                  <div key={idx} className="enquiries-line-row">
                                    <input
                                      className="form-control"
                                      placeholder="Description"
                                      value={line.description}
                                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      className="form-control enquiries-line-qty"
                                      title="Qty"
                                      value={line.quantity}
                                      onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      className="form-control enquiries-line-price"
                                      title="Unit price"
                                      value={line.unitPrice}
                                      onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                                    />
                                    {lineItems.length > 1 ? (
                                      <button type="button" className="btn btn-outline btn-sm" onClick={() => removeLine(idx)}>
                                        Remove
                                      </button>
                                    ) : (
                                      <span />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      {respondError ? (
                        <div className="card card--error" style={{ marginTop: 12 }}>
                          <div className="card-body" style={{ fontSize: 13 }}>
                            {respondError}
                          </div>
                        </div>
                      ) : null}
                      <div className="transactions-modal-actions" style={{ marginTop: 16 }}>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setRespondOpen(false)} disabled={respondMutation.isPending}>
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={respondMutation.isPending}>
                          {respondMutation.isPending ? 'Sending…' : 'Submit response'}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </>
              ) : (
                <p>Enquiry not found.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(closeTarget)}
        title="Close enquiry"
        message={`Mark the enquiry from "${closeTarget?.name || 'guest'}" as closed?`}
        confirmLabel="Close enquiry"
        onConfirm={() => {
          const id = closeTarget?.id;
          if (id) closeMutation.mutate(id);
        }}
        onCancel={() => setCloseTarget(null)}
        busy={closeMutation.isPending}
      />
    </div>
  );
}
