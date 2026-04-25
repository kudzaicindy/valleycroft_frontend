import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getEmployees, getWorklogs, createWorklog } from '@/api/staff';
import { createSalary, deleteSalary, getSalary, updateSalary } from '@/api/finance';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import ConfirmModal from '@/components/ConfirmModal';
import './StaffPage.css';

const LIMIT = 50;
const LOG_TYPE_HOURS = 'hours';
const LOG_TYPE_INTERVAL = 'interval';
const SALARY_PAGE_LIMIT = 150;

function toLocalDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(val) {
  return formatDateDayMonthYear(val);
}

function empName(emp) {
  return emp?.name ?? emp?.firstName ?? emp?.email ?? emp?._id ?? '—';
}

function worklogTime(log) {
  const h = log.hoursWorked ?? log.hours ?? log.hours_worked;
  if (h != null && Number(h) > 0) return `${Number(h)} h`;
  const start = log.startTime ?? log.start_time;
  const end = log.endTime ?? log.end_time;
  if (start && end) return `${start} – ${end}`;
  return '—';
}

function fmtRand(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `R ${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

export default function StaffPage() {
  const location = useLocation();
  const isWorkLogsRoute = /\/work-logs\/?$/.test(location.pathname);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canRecordPayment = ['admin', 'finance'].includes(String(user?.role || '').toLowerCase());

  const [logSearch, setLogSearch] = useState('');
  const [logEmployeeFilter, setLogEmployeeFilter] = useState('');
  const [addLogModalOpen, setAddLogModalOpen] = useState(false);
  const [logStaffName, setLogStaffName] = useState('');
  const [logWorkDone, setLogWorkDone] = useState('');
  const [logWorkDate, setLogWorkDate] = useState(() => toLocalDateStr(new Date()));
  const [logPeriod, setLogPeriod] = useState('daily');
  const [logType, setLogType] = useState(LOG_TYPE_HOURS);
  const [logHours, setLogHours] = useState('');
  const [logStart, setLogStart] = useState('');
  const [logEnd, setLogEnd] = useState('');
  const [addLogFormError, setAddLogFormError] = useState('');

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payName, setPayName] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payFormError, setPayFormError] = useState('');
  const [payEditId, setPayEditId] = useState('');
  const [payDeleteTarget, setPayDeleteTarget] = useState(null);
  const [paySearch, setPaySearch] = useState('');
  const [payMonthFilter, setPayMonthFilter] = useState('');
  const [logMonthFilter, setLogMonthFilter] = useState('');

  useEffect(() => {
    if (!addLogModalOpen && !payModalOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setAddLogModalOpen(false);
        setPayModalOpen(false);
        setAddLogFormError('');
        setPayFormError('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addLogModalOpen, payModalOpen]);

  const { data: employeesData, error: employeesError } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees({ limit: LIMIT }),
  });
  const rawEmployees = Array.isArray(employeesData) ? employeesData : (employeesData?.data ?? employeesData?.employees ?? []);

  const { data: salaryData, isLoading: salaryLoading, error: salaryError } = useQuery({
    queryKey: ['salary', 'staff-payments-page'],
    queryFn: () => getSalary({ limit: SALARY_PAGE_LIMIT, page: 1 }),
    enabled: !isWorkLogsRoute,
  });

  const paymentsRaw = useMemo(() => {
    const d = salaryData;
    if (Array.isArray(d)) return d;
    return d?.data ?? [];
  }, [salaryData]);

  const employeeNameById = useCallback((id) => {
    if (id == null || id === '') return '—';
    const e = rawEmployees.find((x) => String(x._id ?? x.id) === String(id));
    return e ? empName(e) : String(id).slice(-8);
  }, [rawEmployees]);

  const paymentPaidTo = useCallback(
    (p) => {
      if (p.employee && typeof p.employee === 'object' && p.employee.name) return p.employee.name;
      if (p.employee && typeof p.employee === 'string' && p.employee.trim()) return p.employee.trim();
      if (p.payeeName) return String(p.payeeName);
      if (p.employeeName) return String(p.employeeName);
      return employeeNameById(p.employeeId);
    },
    [employeeNameById]
  );

  const filteredPayments = useMemo(() => {
    let rows = paymentsRaw;
    if (payMonthFilter) {
      rows = rows.filter((p) => {
        const m =
          p.month != null && p.month !== '' ? String(p.month).slice(0, 7) : String(p.paidOn ?? '').slice(0, 7);
        if (!m) return true;
        return m === payMonthFilter;
      });
    }
    if (!paySearch.trim()) return rows;
    const q = paySearch.trim().toLowerCase();
    return rows.filter((p) => {
      const who = String(paymentPaidTo(p)).toLowerCase();
      const notes = String(p.notes || '').toLowerCase();
      return who.includes(q) || notes.includes(q);
    });
  }, [paymentsRaw, paySearch, payMonthFilter, paymentPaidTo]);

  const { data: allWorklogsData, isLoading: allLogsLoading } = useQuery({
    queryKey: ['worklogs', 'admin-all'],
    queryFn: () => getWorklogs({ limit: 300 }),
    enabled: isWorkLogsRoute,
  });
  const allLogsRaw = useMemo(() => {
    const d = allWorklogsData;
    if (Array.isArray(d)) return d;
    return d?.data ?? d?.worklogs ?? [];
  }, [allWorklogsData]);

  const filteredAllLogs = useMemo(() => {
    let rows = allLogsRaw;
    if (logEmployeeFilter) {
      rows = rows.filter((w) => String(w.employeeId ?? w.employee?._id ?? w.employee) === logEmployeeFilter);
    }
    if (logMonthFilter) {
      rows = rows.filter((w) => {
        const d = String(w.workDate ?? w.date ?? w.createdAt ?? '').slice(0, 7);
        if (!d || d.length < 7) return true;
        return d === logMonthFilter;
      });
    }
    if (!logSearch.trim()) return rows;
    const q = logSearch.trim().toLowerCase();
    return rows.filter((w) => {
      const name = employeeNameById(w.employeeId ?? w.employee?._id ?? w.employee).toLowerCase();
      const done = String(w.workDone || '').toLowerCase();
      return name.includes(q) || done.includes(q);
    });
  }, [allLogsRaw, logSearch, logEmployeeFilter, logMonthFilter, employeeNameById]);

  const wagePaymentMutation = useMutation({
    mutationFn: (body) => createSalary(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary'] });
      setPayModalOpen(false);
      setPayName('');
      setPayNotes('');
      setPayAmount('');
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayFormError('');
      setPayEditId('');
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, body }) => updateSalary(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary'] });
      setPayModalOpen(false);
      setPayName('');
      setPayNotes('');
      setPayAmount('');
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayFormError('');
      setPayEditId('');
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id) => deleteSalary(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary'] });
    },
  });

  const createWorklogMutation = useMutation({
    mutationFn: (body) => createWorklog(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs', 'admin-all'] });
      queryClient.invalidateQueries({ queryKey: ['worklogs'] });
      setAddLogModalOpen(false);
      setLogStaffName('');
      setAddLogFormError('');
      setLogWorkDone('');
      setLogHours('');
      setLogStart('');
      setLogEnd('');
      setLogWorkDate(toLocalDateStr(new Date()));
    },
  });

  function matchEmployeesByEnteredName(name) {
    const t = name.trim().toLowerCase();
    if (!t) return [];
    return rawEmployees.filter((emp) => {
      const n = String(empName(emp)).trim().toLowerCase();
      if (!n) return false;
      return n === t || n.includes(t) || t.includes(n);
    });
  }

  function handleStandalonePaymentSubmit(e) {
    e.preventDefault();
    setPayFormError('');
    if (!payName.trim() || !payNotes.trim()) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayFormError('Enter a valid amount greater than zero.');
      return;
    }
    const matches = matchEmployeesByEnteredName(payName);
    if (matches.length > 1) {
      setPayFormError(`Several matches — use a fuller name: ${matches.map(empName).join(', ')}`);
      return;
    }
    const matchedEmployee = matches[0] || null;
    const employeeId = matchedEmployee?._id ?? matchedEmployee?.id;
    const paidOn = payDate || new Date().toISOString().slice(0, 10);
    const payload = {
      ...(employeeId ? { employeeId } : {}),
      payeeName: payName.trim(),
      amount: amt,
      paidOn,
      month: paidOn.length >= 7 ? paidOn.slice(0, 7) : undefined,
      notes: payNotes.trim(),
    };
    if (payEditId) {
      updatePaymentMutation.mutate({ id: payEditId, body: payload });
      return;
    }
    wagePaymentMutation.mutate(payload);
  }

  function openCreatePaymentModal() {
    wagePaymentMutation.reset();
    updatePaymentMutation.reset();
    setPayFormError('');
    setPayEditId('');
    setPayName('');
    setPayNotes('');
    setPayAmount('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayModalOpen(true);
  }

  function openEditPaymentModal(payment) {
    if (!payment) return;
    wagePaymentMutation.reset();
    updatePaymentMutation.reset();
    setPayFormError('');
    setPayEditId(String(payment._id ?? payment.id ?? ''));
    setPayName(String(paymentPaidTo(payment) || ''));
    setPayNotes(String(payment.notes || ''));
    setPayAmount(payment.amount != null ? String(payment.amount) : '');
    setPayDate(
      payment.paidOn
        ? String(payment.paidOn).slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setPayModalOpen(true);
  }

  function handleDeletePayment(payment) {
    const id = String(payment?._id ?? payment?.id ?? '').trim();
    if (!id) return;
    setPayDeleteTarget({ id, label: String(paymentPaidTo(payment) || 'this payment') });
  }

  function confirmDeletePayment() {
    const id = String(payDeleteTarget?.id || '').trim();
    if (!id) return;
    deletePaymentMutation.mutate(id, {
      onSettled: () => setPayDeleteTarget(null),
    });
  }

  function handleAddWorklogSubmit(e) {
    e.preventDefault();
    setAddLogFormError('');
    if (!logStaffName.trim() || !logWorkDone.trim()) return;
    const matches = matchEmployeesByEnteredName(logStaffName);
    if (matches.length === 0) {
      setAddLogFormError(
        'No worker matches that name. Check spelling or add the person as an employee first.'
      );
      return;
    }
    if (matches.length > 1) {
      setAddLogFormError(`Several matches — type a fuller name: ${matches.map(empName).join(', ')}`);
      return;
    }
    const employeeId = matches[0]._id ?? matches[0].id;
    const body = {
      employeeId,
      workDone: logWorkDone.trim(),
      period: logPeriod,
      workDate: logWorkDate,
    };
    if (logType === LOG_TYPE_HOURS) {
      const h = parseFloat(logHours, 10);
      if (Number.isNaN(h) || h <= 0) return;
      body.hoursWorked = h;
    } else {
      if (!logStart.trim() || !logEnd.trim()) return;
      body.startTime = logStart.trim();
      body.endTime = logEnd.trim();
    }
    createWorklogMutation.mutate(body);
  }

  if (isWorkLogsRoute) {
    return (
      <div className="bookings-page staff-page">
        <div className="page-header page-header--compact">
          <div className="page-header-left">
            <div className="page-title">Work logs &amp; wage history</div>
            <div className="page-subtitle">Time and tasks logged by workers — separate from cash payments</div>
          </div>
          <div className="page-header-right" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                createWorklogMutation.reset();
                setAddLogFormError('');
                setAddLogModalOpen(true);
              }}
            >
              <i className="fas fa-plus" /> Add work log
            </button>
          </div>
        </div>

        {employeesError && (
          <div className="card card--error">
            <div className="card-body">{employeesError.message}</div>
          </div>
        )}

        <div className="bookings-main">
          <div className="bookings-filters-bar">
            <DashboardListFilters
              embedded
              search={logSearch}
              onSearchChange={setLogSearch}
              searchPlaceholder="Search by worker name or work description…"
              month={logMonthFilter}
              onMonthChange={setLogMonthFilter}
            />
            <select
              className="form-control"
              value={logEmployeeFilter}
              onChange={(e) => setLogEmployeeFilter(e.target.value)}
              style={{ minWidth: 200 }}
            >
              <option value="">All workers</option>
              {rawEmployees.map((emp) => {
                const id = emp._id ?? emp.id;
                return (
                  <option key={id} value={id}>
                    {empName(emp)}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="card">
            <div className="card-body card-body--no-pad">
              <div className="statement-table-wrap">
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Worker</th>
                      <th>Time</th>
                      <th>Work done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLogsLoading && (
                      <tr>
                        <td colSpan={4}>Loading…</td>
                      </tr>
                    )}
                    {!allLogsLoading && filteredAllLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          No work logs yet. Use Add work log to create one.
                        </td>
                      </tr>
                    )}
                    {!allLogsLoading &&
                      filteredAllLogs.map((log) => {
                        const eid = log.employeeId ?? log.employee?._id ?? log.employee;
                        const done = String(log.workDone || '—');
                        const text = done.length > 120 ? `${done.slice(0, 120)}…` : done;
                        return (
                          <tr key={log._id ?? `${eid}-${log.workDate}-${done.slice(0, 20)}`}>
                            <td>{fmtDate(log.workDate ?? log.date ?? log.createdAt)}</td>
                            <td>{employeeNameById(eid)}</td>
                            <td>{worklogTime(log)}</td>
                            <td>{text}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {addLogModalOpen && (
          <div
            className="rooms-events-modal-overlay"
            onClick={() => {
              setAddLogModalOpen(false);
              setAddLogFormError('');
            }}
            role="presentation"
          >
            <div
              className="rooms-events-modal bookings-add-internal-modal staff-payments-modal"
              onClick={(ev) => ev.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-worklog-title"
            >
              <div className="rooms-events-modal-header">
                <div>
                  <h2 id="add-worklog-title" className="rooms-events-modal-title">
                    Add work log
                  </h2>
                  <p className="rooms-events-modal-sub">Worker name and what was done (time record)</p>
                </div>
                <button
                  type="button"
                  className="rooms-events-modal-close"
                  onClick={() => {
                    setAddLogModalOpen(false);
                    setAddLogFormError('');
                  }}
                  aria-label="Close"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
              <div className="rooms-events-modal-body">
                {addLogFormError && (
                  <div className="card card--error" style={{ marginBottom: 12 }}>
                    <div className="card-body" style={{ fontSize: 12, whiteSpace: 'pre-line' }}>
                      {addLogFormError}
                    </div>
                  </div>
                )}
                {createWorklogMutation.isError && (
                  <div className="card card--error" style={{ marginBottom: 12 }}>
                    <div className="card-body" style={{ fontSize: 12 }}>
                      {createWorklogMutation.error?.message || 'Could not save work log.'}
                    </div>
                  </div>
                )}
                <form className="form-stack" onSubmit={handleAddWorklogSubmit}>
                  <div className="form-group">
                    <label className="form-label">Worker name *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={logStaffName}
                      onChange={(e) => {
                        setLogStaffName(e.target.value);
                        setAddLogFormError('');
                      }}
                      placeholder="Type name as on your employee list"
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Work date *</label>
                    <input
                      type="date"
                      className="form-control"
                      value={logWorkDate}
                      onChange={(e) => setLogWorkDate(e.target.value || toLocalDateStr(new Date()))}
                      style={{ maxWidth: 200 }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Period</label>
                    <select className="form-control" value={logPeriod} onChange={(e) => setLogPeriod(e.target.value)} style={{ maxWidth: 200 }}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time entry</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="radio" name="log-type" checked={logType === LOG_TYPE_HOURS} onChange={() => setLogType(LOG_TYPE_HOURS)} />
                        Hours
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="radio" name="log-type" checked={logType === LOG_TYPE_INTERVAL} onChange={() => setLogType(LOG_TYPE_INTERVAL)} />
                        Start / end
                      </label>
                    </div>
                  </div>
                  {logType === LOG_TYPE_HOURS ? (
                    <div className="form-group">
                      <label className="form-label">Hours worked *</label>
                      <input
                        type="number"
                        min={0.25}
                        step={0.25}
                        className="form-control"
                        value={logHours}
                        onChange={(e) => setLogHours(e.target.value)}
                        placeholder="e.g. 6"
                        style={{ maxWidth: 160 }}
                        required
                      />
                    </div>
                  ) : (
                    <div className="form-group" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 120px' }}>
                        <label className="form-label">Start *</label>
                        <input type="time" className="form-control" value={logStart} onChange={(e) => setLogStart(e.target.value)} required />
                      </div>
                      <div style={{ flex: '1 1 120px' }}>
                        <label className="form-label">End *</label>
                        <input type="time" className="form-control" value={logEnd} onChange={(e) => setLogEnd(e.target.value)} required />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Work done *</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={logWorkDone}
                      onChange={(e) => setLogWorkDone(e.target.value)}
                      placeholder="Describe tasks completed"
                      required
                    />
                  </div>
                  <div className="bookings-add-internal-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setAddLogModalOpen(false);
                        setAddLogFormError('');
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={createWorklogMutation.isPending}>
                      {createWorklogMutation.isPending ? 'Saving…' : 'Save work log'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bookings-page staff-page acct-ui-page staff-payments-page">
      <div className="acct-ui-topbar">
        <div className="acct-ui-topbar-title-wrap">
          <div className="acct-ui-topbar-title">Worker payments</div>
          <div className="acct-ui-topbar-sub">
            Payouts for work done — paid-to name must match an employee record. Same history under Finance → Payments.
          </div>
        </div>
        <div className="acct-ui-controls">
          {canRecordPayment && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={openCreatePaymentModal}
            >
              <i className="fas fa-hand-holding-usd" aria-hidden /> Record payment
            </button>
          )}
        </div>
      </div>

      <div className="acct-ui-meta">
        {filteredPayments.length} record{filteredPayments.length === 1 ? '' : 's'}
        {paySearch.trim() || payMonthFilter ? ` · filtered` : ''}
      </div>

      {(employeesError || salaryError) && (
        <div className="card card--error" style={{ marginBottom: 12 }}>
          <div className="card-body">{employeesError?.message || salaryError?.message}</div>
        </div>
      )}

      <div className="card finance-stmt-card acct-ui-table-card">
        <div className="card-body card-body--no-pad">
          <div className="staff-pay-table-toolbar">
            <DashboardListFilters
              embedded
              search={paySearch}
              onSearchChange={setPaySearch}
              searchPlaceholder="Worker or notes…"
              month={payMonthFilter}
              onMonthChange={setPayMonthFilter}
            />
          </div>
          <div className="statement-table-wrap staff-pay-table-scroll">
            {salaryLoading && (
              <p className="staff-pay-inline-status">Loading…</p>
            )}
            {!salaryLoading && filteredPayments.length === 0 && (
              <p className="staff-pay-inline-status staff-pay-inline-status--muted">
                {canRecordPayment
                  ? 'No rows match. Clear search or record a payment.'
                  : 'No payment records for this view.'}
              </p>
            )}
            {!salaryLoading && filteredPayments.length > 0 && (
              <table className="acct-ui-table staff-pay-compact-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Paid to</th>
                    <th>Notes</th>
                    <th className="num">Amount</th>
                    {canRecordPayment ? <th style={{ width: 150 }}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => {
                    const notes = String(p.notes || '—');
                    return (
                      <tr key={p._id ?? `${p.employeeId}-${p.paidOn}-${p.amount}`}>
                        <td className="staff-pay-cell-date">{p.paidOn ? fmtDate(p.paidOn) : '—'}</td>
                        <td className="staff-pay-cell-name">{paymentPaidTo(p)}</td>
                        <td className="staff-pay-cell-notes" title={notes.length > 80 ? notes : undefined}>
                          {notes.length > 100 ? `${notes.slice(0, 100)}…` : notes}
                        </td>
                        <td className="num staff-pay-cell-amt">{fmtRand(p.amount)}</td>
                        {canRecordPayment ? (
                          <td>
                            <div className="transactions-table-actions">
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => openEditPaymentModal(p)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => handleDeletePayment(p)}
                                disabled={deletePaymentMutation.isPending}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {payModalOpen && canRecordPayment && (
        <div
          className="rooms-events-modal-overlay"
          onClick={() => {
            setPayModalOpen(false);
            setPayFormError('');
          }}
          role="presentation"
        >
          <div
            className="rooms-events-modal bookings-add-internal-modal staff-payments-modal"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-pay-title"
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="record-pay-title" className="rooms-events-modal-title">
                  {payEditId ? 'Edit payment' : 'Record payment'}
                </h2>
                <p className="rooms-events-modal-sub">Money paid to a worker for work they did</p>
              </div>
              <button
                type="button"
                className="rooms-events-modal-close"
                onClick={() => {
                  setPayModalOpen(false);
                  setPayFormError('');
                  setPayEditId('');
                }}
                aria-label="Close"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              {payFormError && (
                <div className="card card--error" style={{ marginBottom: 12 }}>
                  <div className="card-body" style={{ fontSize: 12, whiteSpace: 'pre-line' }}>
                    {payFormError}
                  </div>
                </div>
              )}
              {(wagePaymentMutation.isError || updatePaymentMutation.isError) && (
                <div className="card card--error" style={{ marginBottom: 12 }}>
                  <div className="card-body" style={{ fontSize: 12 }}>
                    {wagePaymentMutation.error?.message || updatePaymentMutation.error?.message || 'Could not save payment.'}
                  </div>
                </div>
              )}
              <form className="form-stack" onSubmit={handleStandalonePaymentSubmit}>
                <div className="form-group">
                  <label className="form-label">Who was paid *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={payName}
                    onChange={(e) => {
                      setPayName(e.target.value);
                      setPayFormError('');
                    }}
                    placeholder="Worker name (must match employee list)"
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">What they did *</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="e.g. Full day in kitchen, stock take, deep clean cottage 2"
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
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                    style={{ maxWidth: 200 }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Date paid *</label>
                  <input type="date" className="form-control" value={payDate} onChange={(e) => setPayDate(e.target.value)} required style={{ maxWidth: 200 }} />
                </div>
                <div className="bookings-add-internal-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setPayModalOpen(false);
                      setPayFormError('');
                      setPayEditId('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={wagePaymentMutation.isPending || updatePaymentMutation.isPending}
                  >
                    {wagePaymentMutation.isPending || updatePaymentMutation.isPending
                      ? 'Saving…'
                      : (payEditId ? 'Save changes' : 'Save payment')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={Boolean(payDeleteTarget)}
        title="Delete worker payment"
        message={`Delete payment record for "${payDeleteTarget?.label || 'this worker'}"? This cannot be undone.`}
        confirmLabel="Delete payment"
        onConfirm={confirmDeletePayment}
        onCancel={() => setPayDeleteTarget(null)}
        busy={deletePaymentMutation.isPending}
        tone="danger"
      />
    </div>
  );
}
