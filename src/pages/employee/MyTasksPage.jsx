import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getTasksByEmployee } from '@/api/staff';
import { formatDateDayMonthYear } from '@/utils/formatDate';

function fmtDate(val) {
  return formatDateDayMonthYear(val);
}

export default function MyTasksPage() {
  const { user } = useAuth();
  const userId = user?.sub || user?._id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tasks', 'me', userId],
    queryFn: () => getTasksByEmployee(userId),
    enabled: !!userId,
  });

  const assignments = Array.isArray(data) ? data : (data?.data ?? data?.tasks ?? []);

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">My Tasks</div>
          <div className="page-subtitle">Assignments from admin — complete them and log work linked to the task</div>
        </div>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body">
          {!userId && <p className="text-muted">Sign in to see your tasks.</p>}
          {userId && isLoading && <p className="text-muted">Loading assignments…</p>}
          {userId && !isLoading && assignments.length === 0 && (
            <p className="text-muted">You have no assigned tasks. When admin assigns tasks they will appear here.</p>
          )}
          {userId && !isLoading && assignments.length > 0 && (
            <ul className="staff-list-compact" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {assignments.map((a) => {
                const labels = Array.isArray(a.tasksAssigned) && a.tasksAssigned.length ? a.tasksAssigned.join(', ') : (a.title ?? 'Task');
                const done = (a.workDone ?? '').toString().trim() !== '';
                return (
                  <li key={a._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--linen)' }}>
                    <strong>{labels || 'Task'}</strong>
                    {a.dueDate && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Due {fmtDate(a.dueDate)}</span>}
                    {a.workDate && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>Assigned {fmtDate(a.workDate)}</span>}
                    {done ? (
                      <span className="badge badge-confirmed" style={{ marginLeft: 8 }}>Done</span>
                    ) : (
                      <span className="badge badge-pending" style={{ marginLeft: 8 }}>Pending</span>
                    )}
                    {done && a.workDone && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{String(a.workDone).slice(0, 120)}{a.workDone.length > 120 ? '…' : ''}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
