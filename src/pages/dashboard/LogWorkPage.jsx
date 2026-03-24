import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { createWorklog, getTasksByEmployee } from '@/api/staff';

const LOG_TYPE_HOURS = 'hours';
const LOG_TYPE_INTERVAL = 'interval';

function toLocalDateStr(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function LogWorkPage() {
  const { user } = useAuth();
  const userId = user?.sub || user?._id;
  const [workDone, setWorkDone] = useState('');
  const [period, setPeriod] = useState('daily');
  const [logType, setLogType] = useState(LOG_TYPE_HOURS);
  const [hoursWorked, setHoursWorked] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [workDate, setWorkDate] = useState(() => toLocalDateStr(new Date()));
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const queryClient = useQueryClient();

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', 'me', userId],
    queryFn: () => getTasksByEmployee(userId),
    enabled: !!userId,
  });
  const assignedTasks = Array.isArray(tasksData) ? tasksData : (tasksData?.data ?? tasksData?.tasks ?? []);
  const assignmentLabel = (a) => {
    const labels = Array.isArray(a.tasksAssigned) && a.tasksAssigned.length ? a.tasksAssigned.join(', ') : (a.title ?? a.name ?? 'Task');
    const due = a.dueDate ? ` (due ${new Date(a.dueDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })})` : '';
    return `${labels || 'Task'}${due}`;
  };

  const mutation = useMutation({
    mutationFn: (body) => createWorklog(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs'] });
      setWorkDone('');
      setHoursWorked('');
      setStartTime('');
      setEndTime('');
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!workDone.trim()) return;
    const body = { workDone: workDone.trim(), period };
    if (workDate) body.workDate = workDate;
    if (selectedTaskId) body.taskId = selectedTaskId;
    if (logType === LOG_TYPE_HOURS) {
      const hours = parseFloat(hoursWorked, 10);
      if (isNaN(hours) || hours <= 0) {
        alert('Please enter a valid number of hours.');
        return;
      }
      body.hoursWorked = hours;
    } else {
      if (!startTime.trim() || !endTime.trim()) {
        alert('Please enter both start and end time.');
        return;
      }
      body.startTime = startTime.trim();
      body.endTime = endTime.trim();
    }
    mutation.mutate(body);
  }

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Log Work</div>
          <div className="page-subtitle">Log hours or time interval and describe work done. Log against a date and optionally an assigned task.</div>
        </div>
      </div>
      {mutation.error && <div className="card card--error"><div className="card-body">{mutation.error.message}</div></div>}
      {mutation.isSuccess && <div className="card" style={{ borderColor: 'var(--forest)' }}><div className="card-body">Work log submitted.</div></div>}

      {userId && (
        <div className="card card--compact">
          <div className="card-body">
            <div className="form-group">
              <span className="form-label">Assigned tasks</span>
              {tasksLoading ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Checking assigned tasks…</p>
              ) : assignedTasks.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>You have no assigned tasks. You can still log general work below.</p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--forest)', margin: 0 }}>You have {assignedTasks.length} assigned task(s). Optionally link this log to one below.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card card--compact">
        <div className="card-body">
          <form onSubmit={handleSubmit} className="form-stack">
            <div className="form-group">
              <label className="form-label">Work date</label>
              <input
                type="date"
                className="form-control"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value || toLocalDateStr(new Date()))}
                max={toLocalDateStr(new Date())}
                style={{ maxWidth: 160 }}
              />
            </div>
            {assignedTasks.length > 0 && (
              <div className="form-group">
                <label className="form-label">Link to task (optional)</label>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="form-control"
                  style={{ maxWidth: 280 }}
                >
                  <option value="">— None —</option>
                  {assignedTasks.map((t) => (
                    <option key={t._id} value={t._id}>
                      {assignmentLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="form-control">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Log time by</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                  <input type="radio" name="logType" checked={logType === LOG_TYPE_HOURS} onChange={() => setLogType(LOG_TYPE_HOURS)} />
                  Hours worked
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                  <input type="radio" name="logType" checked={logType === LOG_TYPE_INTERVAL} onChange={() => setLogType(LOG_TYPE_INTERVAL)} />
                  Start / End time
                </label>
              </div>
            </div>
            {logType === LOG_TYPE_HOURS ? (
              <div className="form-group">
                <label className="form-label">Hours worked</label>
                <input
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  className="form-control"
                  placeholder="e.g. 2.5"
                  value={hoursWorked}
                  onChange={(e) => setHoursWorked(e.target.value)}
                  style={{ maxWidth: 120 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Use 0.25 for 15 min, 0.5 for 30 min, 1 for 1 hour</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Start time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Work completed</label>
              <textarea className="form-control" rows={3} placeholder="Describe what you did…" value={workDone} onChange={(e) => setWorkDone(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Submitting…' : 'Submit work log'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
