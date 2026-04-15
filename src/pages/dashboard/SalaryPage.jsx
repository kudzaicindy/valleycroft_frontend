import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSalary, createSalary } from '@/api/finance';
import { getEmployees } from '@/api/staff';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import './SalaryPage.css';

export default function SalaryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [empId, setEmpId] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading, error } = useQuery({
    queryKey: ['salary', page],
    queryFn: () => getSalary({ page, limit: 20 }),
  });
  const { data: emps } = useQuery({
    queryKey: ['employees', 'payments-page'],
    queryFn: () => getEmployees({ limit: 100 }),
  });

  const rawList = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};
  const empList = Array.isArray(emps) ? emps : (emps?.data ?? emps?.employees ?? []);

  const list = useMemo(() => {
    let rows = rawList;
    if (monthFilter.trim()) {
      const m = monthFilter.trim();
      rows = rows.filter((s) => String(s.month || '').startsWith(m));
    }
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      const name = (s.employee && s.employee.name) || s.employeeId || '';
      return String(name).toLowerCase().includes(q) || String(s.notes || '').toLowerCase().includes(q);
    });
  }, [rawList, search, monthFilter]);

  const paymentMutation = useMutation({
    mutationFn: (body) => createSalary(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary'] });
      setModalOpen(false);
      setNotes('');
      setAmount('');
      setEmpId('');
      setPaidOn(new Date().toISOString().slice(0, 10));
    },
  });

  function fmt(n) {
    if (n == null) return '-';
    return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const a = Number(amount);
    if (!empId || !Number.isFinite(a) || a <= 0) return;
    const po = paidOn || new Date().toISOString().slice(0, 10);
    paymentMutation.mutate({
      employeeId: empId,
      amount: a,
      paidOn: po,
      month: po.length >= 7 ? po.slice(0, 7) : undefined,
      notes: notes.trim() || 'Wage payment',
    });
  }

  return (
    <div className="salary-payments-page">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Payments</div>
          <div className="page-subtitle">Record and view wage and salary payments</div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            paymentMutation.reset();
            setModalOpen(true);
          }}
        >
          <i className="fas fa-plus" /> Record payment
        </button>
      </div>
      {error && (
        <div className="card card--error">
          <div className="card-body">{error.message}</div>
        </div>
      )}

      <div className="salary-pay-toolbar bookings-filters-bar">
        <input
          type="search"
          className="form-control"
          placeholder="Search by employee or notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <input
          type="month"
          className="form-control"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{ minWidth: 160 }}
        />
      </div>

      {modalOpen && (
        <div
          className="rooms-events-modal-overlay"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="rooms-events-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="payment-modal-title" className="rooms-events-modal-title">
                  Record payment
                </h2>
                <p className="rooms-events-modal-sub">Wage or salary — linked to an employee</p>
              </div>
              <button type="button" className="rooms-events-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              {paymentMutation.isError && (
                <div className="card card--error" style={{ marginBottom: 12 }}>
                  <div className="card-body" style={{ fontSize: 12 }}>
                    {paymentMutation.error?.message || 'Could not save.'}
                  </div>
                </div>
              )}
              <form className="form-stack" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Employee *</label>
                  <select className="form-control" value={empId} onChange={(e) => setEmpId(e.target.value)} required>
                    <option value="">— Select —</option>
                    {empList.map((e) => {
                      const id = e._id ?? e.id;
                      const name = e.name ?? e.firstName ?? e.email ?? id;
                      return (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Work done / notes *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What was completed"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (R) *</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="form-control"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Date paid *</label>
                  <input type="date" className="form-control" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
                </div>
                <div className="bookings-add-internal-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={paymentMutation.isPending}>
                    {paymentMutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="salary-pay-table-panel">
        <div className="salary-pay-table-wrap">
          <table className="salary-pay-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Paid on</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5}>Loading…</td>
                </tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={5}>No records</td>
                </tr>
              )}
              {!isLoading &&
                list.map((s) => (
                  <tr key={s._id}>
                    <td>{(s.employee && s.employee.name) || s.employeeId || '-'}</td>
                    <td>{s.month || '-'}</td>
                    <td className="salary-pay-amount">{fmt(s.amount)}</td>
                    <td>{s.paidOn ? formatDateDayMonthYear(s.paidOn) : '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-mid)', maxWidth: 280 }}>{s.notes || '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {(meta.total || 0) > 20 && (
          <div className="salary-pay-footer">
            <span>Page {meta.page || page}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={page >= Math.ceil((meta.total || 0) / 20)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
