import { useMemo, useState, useCallback, Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  getDebtors,
  getDebtorPayments,
  getDebtorPaymentPdf,
  sendDebtorPaymentEmail,
  deleteDebtorPayment,
  debtorCode,
  receiptCode,
} from '@/api/debtors';
import ConfirmModal from '@/components/ConfirmModal';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { listFromSuccessEnvelope } from '@/utils/apiEnvelope';
import { fmtRand as fmt } from '@/utils/formatMoney';

const LIMIT = 20;

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'receipt.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DebtorsPage() {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEmail = ['admin', 'finance'].includes(String(user?.role || '').toLowerCase());
  const canDeletePayment = canEmail;
  const [page, setPage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [actionMsg, setActionMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['debtors', page],
    queryFn: () => getDebtors({ page, limit: LIMIT }),
  });
  const list = useMemo(() => listFromSuccessEnvelope(data), [data]);
  const meta = data?.meta ?? {};

  const filtered = useMemo(() => {
    let rows = list;
    if (monthFilter) {
      rows = rows.filter((d) => String(d.createdAt || d.dueDate || '').slice(0, 7) === monthFilter);
    }
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter((d) => {
      const hay = [d.name, d.contactEmail, d.contactPhone, d.status, d.debtorNumber].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [list, tableSearch, monthFilter]);

  const paymentsQuery = useQuery({
    queryKey: ['debtors', expandedId, 'payments'],
    queryFn: () => getDebtorPayments(expandedId),
    enabled: Boolean(expandedId),
  });
  const payments = useMemo(() => listFromSuccessEnvelope(paymentsQuery.data), [paymentsQuery.data]);

  const guestPaymentsHref = useMemo(() => {
    if (location.pathname.startsWith('/admin')) return '/admin/payments';
    if (location.pathname.startsWith('/finance')) return '/finance/payments';
    return null;
  }, [location.pathname]);

  const downloadReceipt = useCallback(async (debtorId, payment) => {
    const paymentId = String(payment._id ?? payment.id ?? '');
    if (!debtorId || !paymentId) return;
    const key = `pdf:${paymentId}`;
    setBusyKey(key);
    setActionMsg(null);
    try {
      const res = await getDebtorPaymentPdf(debtorId, paymentId);
      const blob = res?.data ?? res;
      if (!(blob instanceof Blob)) throw new Error('Receipt PDF was not returned as a file.');
      triggerBlobDownload(blob, `${receiptCode(payment) || paymentId}.pdf`);
    } catch (err) {
      setActionMsg(err?.message || 'Could not download receipt PDF.');
    } finally {
      setBusyKey('');
    }
  }, []);

  const emailReceipt = useCallback(async (debtorId, payment, to) => {
    const paymentId = String(payment._id ?? payment.id ?? '');
    if (!debtorId || !paymentId) return;
    const key = `email:${paymentId}`;
    setBusyKey(key);
    setActionMsg(null);
    try {
      await sendDebtorPaymentEmail(debtorId, paymentId, to ? { to } : {});
      setActionMsg(`Receipt ${receiptCode(payment) || paymentId} emailed.`);
    } catch (err) {
      setActionMsg(err?.message || 'Could not email receipt.');
    } finally {
      setBusyKey('');
    }
  }, []);

  const deleteMutation = useMutation({
    mutationFn: ({ debtorId, paymentId }) => deleteDebtorPayment(debtorId, paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      setDeleteTarget(null);
      setActionMsg('Payment deleted. Debtor balance and ledger were updated.');
    },
    onError: (err) => {
      setActionMsg(err?.message || 'Could not delete payment.');
      setDeleteTarget(null);
    },
  });

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Debtors</div>
          <div className="page-subtitle">Codes like DBT-2026-0001 · expand a row for receipts (RCP-…)</div>
        </div>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      {actionMsg ? (
        <div className="card"><div className="card-body" style={{ fontSize: 13 }}>{actionMsg}</div></div>
      ) : null}
      {guestPaymentsHref ? (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          To record a guest receipt against a booking, use{' '}
          <Link to={guestPaymentsHref} style={{ fontWeight: 600 }}>
            Payments
          </Link>
          .
        </p>
      ) : null}
      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search name, DBT code, contact, status…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Debtor</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Amount owed</th>
                  <th>Paid</th>
                  <th className="statement-table-num">Balance</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={8}>Loading…</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td colSpan={8}>No debtors</td></tr>}
                {!isLoading && filtered.map((d, idx) => {
                  const id = String(d._id ?? d.id ?? `${d.name || 'debtor'}-${idx}`);
                  const open = expandedId === id;
                  return (
                    <Fragment key={id}>
                      <tr>
                        <td><strong>{debtorCode(d) || '—'}</strong></td>
                        <td>{d.name || '—'}</td>
                        <td>{d.contactEmail || d.contactPhone || '—'}</td>
                        <td className="statement-table-num">{fmt(d.amountOwed)}</td>
                        <td className="statement-table-num">{fmt(d.amountPaid)}</td>
                        <td className="statement-table-num">{fmt(d.balance ?? (d.amountOwed - (d.amountPaid || 0)))}</td>
                        <td>
                          <span className={'badge ' + (d.status === 'paid' ? 'badge-paid' : 'badge-pending')}>
                            {d.status || 'outstanding'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setExpandedId(open ? '' : id)}
                          >
                            {open ? 'Hide receipts' : 'Receipts'}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={8} style={{ background: 'rgba(0,0,0,0.02)' }}>
                            {paymentsQuery.isLoading ? <div style={{ padding: 12 }}>Loading receipts…</div> : null}
                            {paymentsQuery.error ? (
                              <div style={{ padding: 12, color: 'var(--red)' }}>{paymentsQuery.error.message}</div>
                            ) : null}
                            {!paymentsQuery.isLoading && payments.length === 0 ? (
                              <div style={{ padding: 12, color: 'var(--text-muted)' }}>No receipts for this debtor.</div>
                            ) : null}
                            {payments.length > 0 ? (
                              <div className="statement-table-wrap" style={{ padding: 8 }}>
                                <table className="statement-table">
                                  <thead>
                                    <tr>
                                      <th>Receipt</th>
                                      <th>Date</th>
                                      <th>Method</th>
                                      <th className="statement-table-num">Amount</th>
                                      <th />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {payments.map((p) => {
                                      const paymentId = String(p._id ?? p.id ?? '');
                                      const rcp = receiptCode(p) || paymentId.slice(-8);
                                      return (
                                        <tr key={paymentId}>
                                          <td><strong>{rcp}</strong></td>
                                          <td>{p.paidAt ? String(p.paidAt).slice(0, 10) : '—'}</td>
                                          <td>{p.method || '—'}</td>
                                          <td className="statement-table-num">{fmt(p.amount)}</td>
                                          <td style={{ whiteSpace: 'nowrap' }}>
                                            <button
                                              type="button"
                                              className="btn btn-outline btn-sm"
                                              disabled={busyKey === `pdf:${paymentId}`}
                                              onClick={() => downloadReceipt(id, p)}
                                            >
                                              PDF
                                            </button>
                                            {canEmail ? (
                                              <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                style={{ marginLeft: 6 }}
                                                disabled={busyKey === `email:${paymentId}`}
                                                onClick={() => emailReceipt(id, p, d.contactEmail)}
                                              >
                                                Email
                                              </button>
                                            ) : null}
                                            {canDeletePayment ? (
                                              <button
                                                type="button"
                                                className="btn btn-outline btn-sm"
                                                style={{ marginLeft: 6, color: 'var(--danger, #b42318)', borderColor: 'rgba(180, 35, 24, 0.35)' }}
                                                disabled={deleteMutation.isPending}
                                                onClick={() =>
                                                  setDeleteTarget({
                                                    debtorId: id,
                                                    paymentId,
                                                    receiptNumber: rcp,
                                                    amount: p.amount,
                                                    guestName: d.name,
                                                  })
                                                }
                                              >
                                                Delete
                                              </button>
                                            ) : null}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
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

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete payment"
        message={`Delete receipt ${deleteTarget?.receiptNumber || ''} for ${deleteTarget?.guestName || 'guest'} (${fmt(deleteTarget?.amount)})? This reverses the ledger entry and restores the debtor balance.`}
        confirmLabel="Delete payment"
        onConfirm={() => {
          if (!deleteTarget?.debtorId || !deleteTarget?.paymentId) return;
          deleteMutation.mutate({
            debtorId: deleteTarget.debtorId,
            paymentId: deleteTarget.paymentId,
          });
        }}
        onCancel={() => setDeleteTarget(null)}
        busy={deleteMutation.isPending}
        tone="danger"
      />
    </div>
  );
}
