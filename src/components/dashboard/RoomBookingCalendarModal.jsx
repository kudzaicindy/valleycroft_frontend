import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoom, getRoomBookings, updateRoom } from '@/api/rooms';
import {
  parseLocalDate,
  normalizeBlockedDates,
  isDayBlocked,
  toggleBlockedDate,
} from '@/utils/availability';
import { formatDateDayMonthYear, formatMonthYear } from '@/utils/formatDate';

function fmtDate(val) {
  return formatDateDayMonthYear(val);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function bookingOverlapsDay(booking, day) {
  if ((booking.status || '').toLowerCase() === 'cancelled') return false;
  const start = parseLocalDate(booking.checkIn);
  const end = parseLocalDate(booking.checkOut);
  if (!start || !end) return false;
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return d >= start && d <= end;
}

function buildCalendarCells(viewMonth) {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const cells = [];
  let day = 1 - startPad;
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, day);
    cells.push({
      key: `${y}-${m}-${day}`,
      date: d,
      inMonth: day >= 1 && day <= daysIn,
    });
    day += 1;
  }
  return cells;
}

function patchRoomBlockedInCache(old, id, blockedDates) {
  if (old == null) return { data: { _id: id, blockedDates } };
  if (old?.data && typeof old.data === 'object') {
    return { ...old, data: { ...old.data, blockedDates } };
  }
  return { ...old, blockedDates };
}

/**
 * Month calendar + "Who booked" list (same UX as Rooms page). Uses room-bookings API when ready, else filters guest bookings.
 * When canBlockDates is true (admin), free days can be clicked to block/unblock via updateRoom({ blockedDates }).
 */
export default function RoomBookingCalendarModal({
  roomId,
  roomTitle,
  guestBookingsList,
  onClose,
  canBlockDates = false,
}) {
  const queryClient = useQueryClient();
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [calendarRoomId, setCalendarRoomId] = useState(roomId);

  if (roomId !== calendarRoomId) {
    setCalendarRoomId(roomId);
    const t = new Date();
    setCalendarMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  }

  const stableClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!roomId) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') stableClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roomId, stableClose]);

  const { data: roomDetailData } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => getRoom(roomId),
    enabled: !!roomId,
  });
  const roomDetail = roomDetailData?.data ?? roomDetailData ?? null;

  const { data: roomBookingsData, isFetched: roomBookingsFetched } = useQuery({
    queryKey: ['room-bookings', roomId],
    queryFn: () => getRoomBookings(roomId),
    enabled: !!roomId,
  });

  const modalBookings = useMemo(() => {
    if (!roomId) return [];
    const roomBookingsList = Array.isArray(roomBookingsData)
      ? roomBookingsData
      : Array.isArray(roomBookingsData?.data)
        ? roomBookingsData.data
        : [];
    const list = Array.isArray(guestBookingsList) ? guestBookingsList : [];
    const sortAndFilter = (bookings) =>
      [...bookings]
        .filter((b) => (b.status || '').toLowerCase() !== 'cancelled')
        .sort((a, b) => (parseLocalDate(a.checkIn)?.getTime() ?? 0) - (parseLocalDate(b.checkIn)?.getTime() ?? 0));
    if (roomBookingsFetched) {
      return sortAndFilter(roomBookingsList);
    }
    const fromGuest = list.filter((b) => {
      if ((b.status || '').toLowerCase() === 'cancelled') return false;
      const rid = b.roomId ?? b.room?._id ?? b.room;
      const id = typeof rid === 'object' ? rid?._id : rid;
      return id === roomId;
    });
    return sortAndFilter(fromGuest);
  }, [roomId, roomBookingsData, roomBookingsFetched, guestBookingsList]);

  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);

  const todayLocal = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const blockMutation = useMutation({
    mutationFn: ({ id, body }) => updateRoom(id, body),
    onMutate: async ({ id, body }) => {
      if (!Array.isArray(body?.blockedDates)) return undefined;
      await queryClient.cancelQueries({ queryKey: ['room', id] });
      const previous = queryClient.getQueryData(['room', id]);
      queryClient.setQueryData(['room', id], (old) => patchRoomBlockedInCache(old, id, body.blockedDates));
      queryClient.setQueryData(['rooms'], (old) => {
        if (!old) return old;
        const patchList = (list) =>
          Array.isArray(list)
            ? list.map((r) => ((r._id ?? r.id) === id ? { ...r, blockedDates: body.blockedDates } : r))
            : list;
        if (Array.isArray(old)) return patchList(old);
        if (old?.data && Array.isArray(old.data)) return { ...old, data: patchList(old.data) };
        return old;
      });
      return { previous, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous != null && ctx.id) {
        queryClient.setQueryData(['room', ctx.id], ctx.previous);
      }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room', id] });
      queryClient.invalidateQueries({ queryKey: ['landing-rooms-avail'] });
    },
  });

  function handleToggleBlockedDay(date) {
    if (!canBlockDates || !roomId) return;
    const next = toggleBlockedDate(normalizeBlockedDates(roomDetail), date);
    blockMutation.mutate({ id: roomId, body: { blockedDates: next } });
  }

  function shiftCalendarMonth(delta) {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  if (!roomId) return null;

  const title = roomTitle || 'Room';

  return (
    <div
      className="rooms-events-modal-overlay"
      onClick={stableClose}
      role="presentation"
    >
      <div
        className="rooms-events-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-avail-cal-title"
      >
        <div className="rooms-events-modal-header">
          <div>
            <h2 id="room-avail-cal-title" className="rooms-events-modal-title">
              {title}
            </h2>
            <p className="rooms-events-modal-sub">
              {canBlockDates
                ? 'Click a free day to block or unblock it from booking'
                : 'Guest bookings calendar'}
            </p>
          </div>
          <button type="button" className="rooms-events-modal-close" onClick={stableClose} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="rooms-events-modal-body">
          <>
            <div className="rooms-events-cal-nav">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => shiftCalendarMonth(-1)} aria-label="Previous month">
                <i className="fas fa-chevron-left" />
              </button>
              <span className="rooms-events-cal-label">
                {formatMonthYear(calendarMonth)}
              </span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => shiftCalendarMonth(1)} aria-label="Next month">
                <i className="fas fa-chevron-right" />
              </button>
            </div>
            {canBlockDates && (
              <div className="rooms-events-cal-legend" aria-hidden>
                <span className="rooms-events-cal-legend-item">
                  <span className="rooms-events-cal-legend-swatch available" /> Available
                </span>
                <span className="rooms-events-cal-legend-item">
                  <span className="rooms-events-cal-legend-swatch booked" /> Booked
                </span>
                <span className="rooms-events-cal-legend-item">
                  <span className="rooms-events-cal-legend-swatch blocked" /> Blocked
                </span>
              </div>
            )}
            <div className="rooms-events-cal-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="rooms-events-cal-dow">
                  {d}
                </div>
              ))}
              {calendarCells.map((cell) => {
                const guestsOnDay = modalBookings
                  .filter((b) => bookingOverlapsDay(b, cell.date))
                  .map((b) => b.guestName || 'Guest');
                const uniqueGuests = [...new Set(guestsOnDay)];
                const isToday = sameDay(cell.date, todayLocal);
                const blocked = isDayBlocked(roomDetail, cell.date);
                const canToggleBlock = canBlockDates && cell.inMonth && uniqueGuests.length === 0;
                const CellTag = canToggleBlock ? 'button' : 'div';
                return (
                  <CellTag
                    key={cell.key}
                    type={canToggleBlock ? 'button' : undefined}
                    className={`rooms-events-cal-cell ${cell.inMonth ? 'in-month' : 'out-month'} ${uniqueGuests.length ? 'has-booking' : ''} ${blocked ? 'has-block' : ''} ${isToday ? 'is-today' : ''} ${canToggleBlock ? 'is-blockable' : ''}`}
                    title={
                      uniqueGuests.length
                        ? uniqueGuests.join(', ')
                        : blocked
                          ? canBlockDates
                            ? 'Blocked — click to unblock'
                            : 'Blocked'
                          : canToggleBlock
                            ? 'Click to block this day'
                            : undefined
                    }
                    onClick={canToggleBlock ? () => handleToggleBlockedDay(cell.date) : undefined}
                    disabled={canToggleBlock && blockMutation.isPending ? true : undefined}
                  >
                    <span className="rooms-events-cal-daynum">{cell.date.getDate()}</span>
                    {uniqueGuests.length > 0 && (
                      <span className="rooms-events-cal-guest" title={uniqueGuests.join(', ')}>
                        {uniqueGuests[0]}
                        {uniqueGuests.length > 1 ? ` +${uniqueGuests.length - 1}` : ''}
                      </span>
                    )}
                    {blocked && uniqueGuests.length === 0 && (
                      <span className="rooms-events-cal-blocked-label">Blocked</span>
                    )}
                  </CellTag>
                );
              })}
            </div>
            {canBlockDates && blockMutation.isError ? (
              <p className="rooms-events-cal-error" role="alert">
                {blockMutation.error?.message || 'Could not save blocked days. Check that the API accepts blockedDates.'}
              </p>
            ) : null}
            <div className="rooms-events-bookings">
              <h3 className="rooms-events-bookings-title">Who booked</h3>
              {modalBookings.length === 0 ? (
                <p className="rooms-events-empty">No bookings for this room.</p>
              ) : (
                <ul className="rooms-events-bookings-list">
                  {modalBookings.map((b) => (
                    <li key={b._id ?? b.id ?? `${b.guestName}-${b.checkIn}`}>
                      <span className="rooms-events-b-name">{b.guestName || 'Guest'}</span>
                      <span className="rooms-events-b-dates">
                        {fmtDate(b.checkIn)} – {fmtDate(b.checkOut)}
                      </span>
                      <span className={`rooms-events-b-status ${(b.status || '').toLowerCase() === 'confirmed' ? 'confirmed' : ''}`}>
                        {(b.status || 'pending').replace(/-/g, ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        </div>
      </div>
    </div>
  );
}
