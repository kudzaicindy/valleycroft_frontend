import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { getInvoicePdf, getInvoices } from '@/api/invoices';
import { fmtRand as fmt } from '@/utils/formatMoney';

const LIMIT = 20;
function looksLikeHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function invoiceName(i) {
  return (
    i.guestName ||
    i.customerName ||
    i.name ||
    i.booking?.guestName ||
    i.booking?.customerName ||
    '—'
  );
}

function invoiceRoomName(i) {
  return (
    i.room?.name ||
    i.booking?.roomName ||
    i.roomName ||
    i.booking?.room?.name ||
    '—'
  );
}

function invoiceEmail(i) {
  return i.guestEmail || i.customerEmail || i.email || i.booking?.guestEmail || i.booking?.email || '';
}

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices', page],
    queryFn: () => getInvoices({ page, limit: LIMIT }),
  });
  const listRaw = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};
  const list = useMemo(() => {
    let rows = listRaw;
    if (monthFilter) {
      rows = rows.filter((i) => {
        const d = String(i.dueDate ?? i.issueDate ?? i.createdAt ?? '').slice(0, 7);
        if (!d) return true;
        return d === monthFilter;
      });
    }
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter(
      (i) =>
        String(i.invoiceNumber || i._id || '').toLowerCase().includes(q) ||
        String(invoiceName(i)).toLowerCase().includes(q) ||
        String(invoiceRoomName(i)).toLowerCase().includes(q) ||
        String(i.type || '').toLowerCase().includes(q) ||
        String(i.status || '').toLowerCase().includes(q)
    );
  }, [listRaw, monthFilter, tableSearch]);

  const resolveInvoicePdfUrl = useCallback(async (invoice) => {
    const direct = invoice?.pdfUrl || invoice?.downloadUrl || invoice?.shareUrl;
    if (looksLikeHttpUrl(direct)) return direct;
    return '';
  }, []);

  const handleDownload = useCallback(async (invoice) => {
    const id = invoice?._id ?? invoice?.id ?? '';
    if (!id) return;
    setActionBusyId(String(id));
    try {
      const res = await getInvoicePdf(id);
      const blob = res?.data ?? res;
      if (!(blob instanceof Blob)) {
        window.alert('Invoice PDF was not returned.');
        return;
      }
      if (blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        let msg = 'Could not download invoice.';
        try {
          msg = JSON.parse(text)?.message || msg;
        } catch {
          /* ignore */
        }
        window.alert(msg);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoiceNumber || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err?.message || 'Could not download invoice.');
    } finally {
      setActionBusyId('');
    }
  }, []);

  const handleShareEmail = useCallback(async (invoice) => {
    const id = invoice?._id ?? invoice?.id ?? '';
    if (!id) return;
    setActionBusyId(String(id));
    try {
      const url = await resolveInvoicePdfUrl(invoice);
      const to = invoiceEmail(invoice);
      const ref = invoice.invoiceNumber || id;
      const linkLine = url ? `\n${url}\n` : '\n';
      const mail = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Invoice ${ref}`)}&body=${encodeURIComponent(`Hello,\n\nPlease find your invoice ${ref}.${linkLine}\nRegards,\nValleyCroft`)}`;
      window.location.href = mail;
    } finally {
      setActionBusyId('');
    }
  }, [resolveInvoicePdfUrl]);

  const handleShareWhatsApp = useCallback(async (invoice) => {
    const id = invoice?._id ?? invoice?.id ?? '';
    if (!id) return;
    setActionBusyId(String(id));
    try {
      const url = await resolveInvoicePdfUrl(invoice);
      const ref = invoice.invoiceNumber || id;
      const text = url ? `Invoice ${ref}: ${url}` : `Invoice ${ref}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } finally {
      setActionBusyId('');
    }
  }, [resolveInvoicePdfUrl]);

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Invoices</div>
          <div className="page-subtitle">Create and manage invoices</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm"><i className="fas fa-plus" /> New</button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search number, name, room name, status…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Name</th>
                  <th>Room name</th>
                  <th>Type</th>
                  <th>Due</th>
                  <th className="statement-table-num">Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={8}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={8}>No invoices</td></tr>}
                {!isLoading && list.map((i) => {
                  const rowId = String(i._id ?? i.id ?? i.invoiceNumber ?? '');
                  return (
                  <tr key={rowId}>
                    <td><strong>{i.invoiceNumber || i._id || '—'}</strong></td>
                    <td>{invoiceName(i)}</td>
                    <td>{invoiceRoomName(i)}</td>
                    <td>{i.type || '—'}</td>
                    <td>{i.dueDate || '—'}</td>
                    <td className="statement-table-num">{fmt(i.total)}</td>
                    <td><span className={'badge ' + (i.status === 'paid' ? 'badge-paid' : 'badge-pending')}>{i.status || 'draft'}</span></td>
                    <td>
                      <div className="transactions-table-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => handleDownload(i)} disabled={actionBusyId === rowId}>
                          Download
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => handleShareEmail(i)} disabled={actionBusyId === rowId}>
                          Email
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => handleShareWhatsApp(i)} disabled={actionBusyId === rowId}>
                          WhatsApp
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          {(meta.total || 0) > LIMIT && (
            <div className="pagination-bar">
              <span className="pagination-info">Page {meta.page ?? page}</span>
              <div className="pagination-btns">
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= Math.ceil((meta.total || 0) / LIMIT)} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
