import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyWorklogs } from '@/api/staff';
import { formatDateDayMonthYear } from '@/utils/formatDate';

const LIMIT = 20;

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.worklogs)) return data.worklogs;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function formatTime(log) {
  const hours = log.hoursWorked ?? log.hours ?? log.hours_worked;
  if (hours != null && Number(hours) > 0) return `${Number(hours)} h`;
  const start = log.startTime ?? log.start_time;
  const end = log.endTime ?? log.end_time;
  if (start && end) return `${start} – ${end}`;
  return '—';
}

function formatWorklogDate(val) {
  return formatDateDayMonthYear(val);
}

export default function MyLogsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['worklogs', 'me', page],
    queryFn: () => getMyWorklogs({ page, limit: LIMIT }),
  });
  const list = normalizeList(data);
  const meta = data?.meta ?? data?.pagination ?? {};

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">My Logs</div>
          <div className="page-subtitle">History of your work log submissions (hours and time shown)</div>
        </div>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Period</th>
                  <th>Hours / Time</th>
                  <th>Submitted</th>
                  <th>Work done</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={5}>No logs yet</td></tr>}
                {!isLoading && list.map((log) => (
                  <tr key={log._id}>
                    <td>{formatWorklogDate(log.workDate ?? log.work_date ?? log.date ?? log.createdAt)}</td>
                    <td>{log.period || 'daily'}</td>
                    <td>{formatTime(log)}</td>
                    <td>{formatWorklogDate(log.createdAt ?? log.created_at)}</td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.workDone ?? log.work_done ?? '—'}</td>
                  </tr>
                ))}
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
