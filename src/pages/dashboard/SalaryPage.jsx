import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSalary, createSalary } from '@/api/finance';
import { getEmployees } from '@/api/staff';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { transactionCategoryLabel } from '@/constants/transactionCategories';
import { parseLocalDate } from '@/utils/availability';
import { formatDateDayMonthYear } from '@/utils/formatDate';

const LIMIT = 20;
const EMPLOYEES_LIMIT = 200;

function moneyOrBlank(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

function formatTableDate(val) {
  if (val == null || val === '') return '—';
  const parsed = parseLocalDate(val);
  if (parsed) return formatDateDayMonthYear(parsed);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : formatDateDayMonthYear(d);
}

function empName(emp) {
  return emp?.name ?? emp?.firstName ?? emp?.email ?? emp?._id ?? '—';
}

function normalizeSalaryFetch(res) {
  if (Array.isArray(res)) {
    return { list: res, total: res.length, page: 1 };
  }
  const list = res?.data ?? res?.items ?? res?.salaries ?? res?.payments ?? [];
  const arr = Array.isArray(list) ? list : [];
  const total = Number(res?.total ?? res?.count ?? arr.length) || arr.length;
  const page = Number(res?.page) || 1;
  return { list: arr, total, page };
}

export default function SalaryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    employeeName: '',
    notes: '',
    amount: '',
    paidOn: new Date().toISOString().slice(0, 10),
  });
  const [saveError, setSaveError] = useState(null);

  const { data: employeesData } = useQuery({
    queryKey: ['employees', 'salary-page'],
    queryFn: () => getEmployees({ limit: EMPLOYEES_LIMIT }),
  });
  const rawEmployees = useMemo(() => {
    const d = employeesData;
    if (Array.isArray(d)) return d;
    return d?.data ?? d?.employees ?? [];
  }, [employeesData]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['salary', 'payments-page', page],
    queryFn: async () => {
      const res = await getSalary({ page, limit: LIMIT });
      return normalizeSalaryFetch(res);
    },
  });

  const listRaw = data?.list ?? [];
  const metaTotal = data?.total ?? listRaw.length;

  const employeeNameById = useCallback(
    (id) => {
      if (id == null || id === '') return '—';
      const e = rawEmployees.find((x) => String(x._id ?? x.id) === String(id));
      return e ? empName(e) : String(id).slice(-8);
    },
    [rawEmployees]
  );

  const paymentPaidTo = useCallback(
    (p) => {
      if (p.employee && typeof p.employee === 'object' && p.employee.name) return p.employee.name;
      if (p.employeeName) return String(p.employeeName);
      return employeeNameById(p.employeeId);
    },
    [employeeNameById]
  );

  const listFiltered = useMemo(() => {
    let rows = listRaw;
    if (monthFilter) {
      rows = rows.filter((p) => {
        const m = p.month != null && p.month !== '' ? String(p.month).slice(0, 7) : '';
        const fromPaid =
          p.paidOn != null && String(p.paidOn).length >= 7 ? String(p.paidOn).slice(0, 7) : '';
        return m === monthFilter || fromPaid === monthFilter;
      });
    }
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter((p) => {
      const who = String(paymentPaidTo(p)).toLowerCase();
      const notes = String(p.notes || '').toLowerCase();
      return who.includes(q) || notes.includes(q);
    });
  }, [listRaw, monthFilter, tableSearch, paymentPaidTo]);

  const totals = useMemo(() => {
    let debit = 0;
    for (const p of listFiltered) {
      const a = Number(p.amount);
      if (Number.isFinite(a)) debit += a;
    }
    return { debit, credit: 0, net: debit };
  }, [listFiltered]);

  const openAdd = useCallback(() => {
    setForm({
      employeeId: '',
      employeeName: '',
      notes: '',
      amount: '',
      paidOn: new Date().toISOString().slice(0, 10),
    });
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSaveError(null);
  }, []);

  const createMutation = useMutation({
    mutationFn: (body) => createSalary(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary'] });
      closeModal();
    },
    onError: (err) => {
      setSaveError(err?.message || 'Could not record payment.');
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    setSaveError(null);
    const hasEmployeeId = Boolean(String(form.employeeId || '').trim());
    const employeeNameText = String(form.employeeName || '').trim();
    if (!hasEmployeeId && !employeeNameText) {
      setSaveError('Select a worker or type employee name.');
      return;
    }
    if (!String(form.notes || '').trim()) {
      setSaveError('Add a short note (e.g. what period this covers).');
      return;
    }
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setSaveError('Enter a valid amount greater than zero.');
      return;
    }
    const paidOn = form.paidOn || new Date().toISOString().slice(0, 10);
    const selectedEmployee = hasEmployeeId
      ? rawEmployees.find((emp) => String(emp._id ?? emp.id) === String(form.employeeId))
      : null;
    createMutation.mutate({
      ...(hasEmployeeId ? { employeeId: form.employeeId } : {}),
      employeeName: employeeNameText || (selectedEmployee ? empName(selectedEmployee) : undefined),
      amount: amt,
      paidOn,
      month: paidOn.length >= 7 ? paidOn.slice(0, 7) : undefined,
      notes: String(form.notes).trim(),
    });
  }

  const saving = createMutation.isPending;
  const colCount = 9;
  const totalPages = Math.max(1, Math.ceil(metaTotal / LIMIT));

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Worker payments</div>
          <div className="page-subtitle">
            Wage and salary payouts recorded in finance (not the general transactions list).
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <i className="fas fa-plus" /> Add payment
        </button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search worker name or notes…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />

      {modalOpen && (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="salary-modal-title"
          onClick={closeModal}
        >
          <div className="transactions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="salary-modal-title">Record worker payment</h3>
              <button type="button" className="transactions-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form onSubmit={handleSubmit}>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="sal-employee">Worker</label>
                    <select
                      id="sal-employee"
                      className="form-control"
                      required
                      value={form.employeeId}
                      onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      {rawEmployees.map((emp) => {
                        const id = emp._id ?? emp.id;
                        return (
                          <option key={String(id)} value={String(id)}>
                            {empName(emp)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="sal-employee-name">Employee name (manual)</label>
                    <input
                      id="sal-employee-name"
                      className="form-control"
                      value={form.employeeName}
                      onChange={(e) => setForm((f) => ({ ...f, employeeName: e.target.value }))}
                      placeholder="Use when worker is not yet in employee list"
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="sal-notes">Notes</label>
                    <input
                      id="sal-notes"
                      className="form-control"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      required
                      placeholder="Period covered, reference…"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="sal-amount">Amount (ZAR)</label>
                    <input
                      id="sal-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="sal-date">Paid on</label>
                    <input
                      id="sal-date"
                      type="date"
                      className="form-control"
                      value={form.paidOn}
                      onChange={(e) => setForm((f) => ({ ...f, paidOn: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <p style={{ marginTop: 10, marginBottom: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                  Creates a salary payment record for the selected worker. Ledger posting depends on your backend
                  configuration.
                </p>
                {saveError && (
                  <div className="card card--error" style={{ marginTop: 12 }}>
                    <div className="card-body" style={{ whiteSpace: 'pre-line', fontSize: 13 }}>
                      {saveError}
                    </div>
                  </div>
                )}
                <div className="transactions-modal-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={closeModal} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Record payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="statement-table-num">Debit</th>
                  <th className="statement-table-num">Credit</th>
                  <th className="statement-table-num">Net</th>
                  <th className="statement-table-num">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={colCount}>Loading…</td>
                  </tr>
                )}
                {!isLoading && listFiltered.length === 0 && (
                  <tr>
                    <td colSpan={colCount}>No worker payments</td>
                  </tr>
                )}
                {!isLoading &&
                  listFiltered.map((p) => {
                    const id = p._id ?? p.id ?? `${p.employeeId}-${p.paidOn}-${p.amount}`;
                    const amount = Number(p.amount);
                    const debit = Number.isFinite(amount) ? amount : null;
                    return (
                      <tr key={String(id)}>
                        <td>{formatTableDate(p.paidOn)}</td>
                        <td>
                          <span className="badge badge-cancelled">expense</span>
                        </td>
                        <td>{transactionCategoryLabel('salary')}</td>
                        <td>
                          <span style={{ display: 'block', fontWeight: 600 }}>{paymentPaidTo(p)}</span>
                          {p.notes ? (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.notes}</span>
                          ) : null}
                        </td>
                        <td className="statement-table-num pl-neg">{moneyOrBlank(debit)}</td>
                        <td className="statement-table-num pl-pos">—</td>
                        <td className={'statement-table-num pl-neg'}>{moneyOrBlank(debit)}</td>
                        <td className="statement-table-num">—</td>
                        <td />
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    <strong>Totals</strong>
                    {monthFilter || tableSearch.trim() ? (
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                        (this page / filters)
                      </span>
                    ) : null}
                  </td>
                  <td className="statement-table-num pl-neg">
                    <strong>{moneyOrBlank(totals.debit)}</strong>
                  </td>
                  <td className="statement-table-num pl-pos">
                    <strong>—</strong>
                  </td>
                  <td className="statement-table-num pl-neg">
                    <strong>{moneyOrBlank(totals.net)}</strong>
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {metaTotal > LIMIT && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Page {page} of {totalPages}
              </span>
              <div className="pagination-btns">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
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
          )}
        </div>
      </div>
    </div>
  );
}
