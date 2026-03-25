import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEmployees, getWorklogs, getTasksByEmployee, createTasks } from '@/api/staff';
import { formatDateDayMonthYear } from '@/utils/formatDate';

const LIMIT = 50;

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

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [assignTaskOpen, setAssignTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTasks, setTaskTasks] = useState('');
  const [taskDue, setTaskDue] = useState('');

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedId(null);
        setAssignTaskOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  const { data: employeesData, isLoading, error } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees({ limit: LIMIT }),
  });
  const rawEmployees = Array.isArray(employeesData) ? employeesData : (employeesData?.data ?? employeesData?.employees ?? []);
  const employees = useMemo(() => {
    if (!search.trim()) return rawEmployees;
    const q = search.trim().toLowerCase();
    return rawEmployees.filter(
      (e) =>
        String(empName(e)).toLowerCase().includes(q) ||
        String(e.email || '').toLowerCase().includes(q) ||
        String(e.role || '').toLowerCase().includes(q)
    );
  }, [rawEmployees, search]);

  const selected = selectedId ? employees.find((e) => (e._id ?? e.id) === selectedId) : null;

  const { data: worklogsData } = useQuery({
    queryKey: ['worklogs', selectedId],
    queryFn: () => getWorklogs(selectedId ? { employeeId: selectedId, limit: 50 } : {}),
    enabled: !!selectedId,
  });
  const allWorklogs = Array.isArray(worklogsData) ? worklogsData : (worklogsData?.data ?? worklogsData?.worklogs ?? []);
  const worklogs = useMemo(() => {
    if (!selectedId) return [];
    return allWorklogs.filter((w) => {
      const eid = w.employeeId ?? (w.employee && (typeof w.employee === 'string' ? w.employee : w.employee._id));
      return eid === selectedId;
    });
  }, [allWorklogs, selectedId]);

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', selectedId],
    queryFn: () => getTasksByEmployee(selectedId),
    enabled: !!selectedId,
  });
  const assignments = Array.isArray(tasksData) ? tasksData : (tasksData?.data ?? tasksData?.tasks ?? []);

  const performance = useMemo(() => {
    let totalHours = 0;
    worklogs.forEach((w) => {
      const h = w.hoursWorked ?? w.hours ?? w.hours_worked;
      if (h != null) totalHours += Number(h);
    });
    return { totalHours, logCount: worklogs.length };
  }, [worklogs]);

  const createTaskMutation = useMutation({
    mutationFn: (body) => createTasks(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['worklogs', selectedId] });
      setTaskTitle('');
      setTaskTasks('');
      setTaskDue('');
      setAssignTaskOpen(false);
    },
  });

  function handleAssignTask(e) {
    e.preventDefault();
    if (!selectedId || !taskTitle.trim()) return;
    const body = { employeeId: selectedId };
    if (taskTasks.trim()) {
      body.tasks = taskTasks.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (!body.tasks || body.tasks.length === 0) {
      body.title = taskTitle.trim();
    }
    if (taskDue) body.dueDate = taskDue;
    createTaskMutation.mutate(body);
  }

  return (
    <div className="bookings-page staff-page">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Staff</div>
          <div className="page-subtitle">View staff, their logs, assign tasks and check performance</div>
        </div>
      </div>

      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}

      <div className="bookings-main">
        <div className="bookings-filters-bar">
          <input
            type="search"
            className="form-control"
            placeholder="Search by name, email or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 260 }}
          />
        </div>

        <div className="card">
          <div className="card-body card-body--no-pad">
            <div className="statement-table-wrap">
              <table className="statement-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Tasks</th>
                    <th>Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
                  {!isLoading && employees.length === 0 && <tr><td colSpan={5}>No staff found</td></tr>}
                  {!isLoading && employees.map((emp) => {
                    const id = emp._id ?? emp.id;
                    return (
                      <tr
                        key={id}
                        className={selectedId === id ? 'selected' : ''}
                        onClick={() => {
                          setSelectedId(id);
                          setAssignTaskOpen(false);
                        }}
                      >
                        <td><strong>{empName(emp)}</strong></td>
                        <td>{emp.email || '—'}</td>
                        <td>{emp.role || '—'}</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedId && selected && (
        <div className="staff-view-modal-overlay" onClick={() => { setSelectedId(null); setAssignTaskOpen(false); }}>
          <div className="staff-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="staff-view-modal-header">
              <div className="staff-view-modal-title-wrap">
                <span className="staff-view-modal-avatar">{String(empName(selected)).slice(0, 1).toUpperCase()}</span>
                <div>
                  <h3>{empName(selected)}</h3>
                  <p className="staff-view-modal-subtitle">{selected.email || 'No email provided'}</p>
                </div>
              </div>
              <div className="staff-view-modal-header-actions">
                <span className="badge badge-confirmed">{selected.role || 'Staff'}</span>
                <button type="button" className="staff-view-modal-close" onClick={() => { setSelectedId(null); setAssignTaskOpen(false); }} aria-label="Close">
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>
            <div className="staff-view-modal-body">
              <div className="staff-view-modal-stats">
                <div className="staff-view-stat">
                  <div className="staff-view-stat-label">Work logs</div>
                  <div className="staff-view-stat-value">{performance.logCount}</div>
                </div>
                <div className="staff-view-stat">
                  <div className="staff-view-stat-label">Total hours</div>
                  <div className="staff-view-stat-value">{performance.totalHours.toFixed(1)} h</div>
                </div>
                <div className="staff-view-stat">
                  <div className="staff-view-stat-label">Assignments</div>
                  <div className="staff-view-stat-value">{assignments.length}</div>
                </div>
              </div>

              <div className="staff-detail-section staff-modal-section">
                <div className="staff-modal-section-header">
                  <div className="review-block-header">Assigned tasks ({assignments.length})</div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setAssignTaskOpen(true)}>
                    Assign task
                  </button>
                </div>
                {assignTaskOpen && (
                  <form onSubmit={handleAssignTask} className="form-stack staff-assign-form">
                    <div className="form-group">
                      <label className="form-label">Task title (single)</label>
                      <input type="text" className="form-control" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. dishes" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Or multiple tasks (one per line or comma-separated)</label>
                      <textarea className="form-control" rows={2} value={taskTasks} onChange={(e) => setTaskTasks(e.target.value)} placeholder="e.g. dishes, clean kitchen" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Due date</label>
                      <input type="date" className="form-control" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                    </div>
                    <div className="staff-assign-form-actions">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={createTaskMutation.isPending || (!taskTitle.trim() && !taskTasks.trim())}>Save</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAssignTaskOpen(false); setTaskTitle(''); setTaskTasks(''); setTaskDue(''); }}>Cancel</button>
                    </div>
                  </form>
                )}
                <ul className="staff-list-compact">
                  {assignments.length === 0 && !assignTaskOpen && <li className="text-muted">No tasks assigned</li>}
                  {assignments.slice(0, 10).map((a) => {
                    const labels = Array.isArray(a.tasksAssigned) ? a.tasksAssigned.join(', ') : (a.title ?? a.name ?? 'Task');
                    const done = (a.workDone ?? '').toString().trim() !== '';
                    return (
                      <li key={a._id ?? a.id}>
                        <strong>{labels || 'Task'}</strong>
                        {a.dueDate && <span> — due {fmtDate(a.dueDate)}</span>}
                        {a.workDate && <span> ({fmtDate(a.workDate)})</span>}
                        {done && <span className="badge badge-confirmed" style={{ marginLeft: 6 }}>Done</span>}
                        {!done && <span className="badge badge-pending" style={{ marginLeft: 6 }}>Pending</span>}
                      </li>
                    );
                  })}
                  {assignments.length > 10 && <li className="text-muted">+{assignments.length - 10} more</li>}
                </ul>
              </div>

              <div className="staff-detail-section staff-modal-section">
                <div className="review-block-header">Recent work logs ({worklogs.length})</div>
                <div className="statement-table-wrap">
                  <table className="statement-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Work done</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worklogs.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-muted">No work logs</td>
                        </tr>
                      )}
                      {worklogs.slice(0, 15).map((log) => {
                        const done = String(log.workDone || '—');
                        const text = done.length > 100 ? `${done.slice(0, 100)}…` : done;
                        return (
                          <tr key={log._id}>
                            <td>{fmtDate(log.workDate ?? log.date ?? log.createdAt)}</td>
                            <td>{worklogTime(log)}</td>
                            <td>{text}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {worklogs.length > 15 && (
                  <div className="text-muted" style={{ marginTop: 6 }}>+{worklogs.length - 15} more</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
