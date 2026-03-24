import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRooms, getRoom, getRoomBookings, updateRoom } from '@/api/rooms';
import { getGuestBookings } from '@/api/guestBookings';
import { parseLocalDate } from '@/utils/availability';

const ROOM_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'booked', label: 'Booked' },
  { value: 'checking-out', label: 'Checking out' },
  { value: 'maintenance', label: 'Maintenance' },
];

const ROOM_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'cottage', label: 'Cottage' },
  { value: 'suite', label: 'Suite' },
  { value: 'farmhouse', label: 'Farmhouse' },
  { value: 'lodge', label: 'Lodge' },
  { value: 'other', label: 'Other' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...ROOM_STATUSES,
];

function getRoomStatus(room) {
  if (room.status) return room.status.toLowerCase();
  if (room.isAvailable === false) return 'maintenance';
  return 'available';
}

function getRoomImage(room) {
  const images = room.images;
  const first = images && images.length > 0 ? images[0] : null;
  const raw = typeof first === 'string' ? first : (first?.url || first?.path || first?.src || '');
  if (raw) {
    if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
    const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
    const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return `${apiBase}${withSlash}`;
  }
  return 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&h=300&fit=crop';
}

function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtNum(n) {
  return n != null ? Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 }) : '—';
}

function fmtOverviewDate() {
  const now = new Date();
  return now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Today at midnight (local) for comparison. */
function getTodayLocal() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** Label for a booking: "Current" if it includes today, else "Next". */
function getBookingTimeLabel(booking) {
  const today = getTodayLocal();
  const checkIn = parseLocalDate(booking.checkIn);
  const checkOut = parseLocalDate(booking.checkOut);
  if (!checkIn || !checkOut) return 'Next';
  if (checkIn <= today && checkOut > today) return 'Current';
  return 'Next';
}

/** Display status: if room has a current guest stay today, show "booked"; else use room.status / isAvailable. */
function getDisplayStatus(room, nextBookingForRoom) {
  if (nextBookingForRoom && getBookingTimeLabel(nextBookingForRoom) === 'Current') return 'booked';
  return getRoomStatus(room);
}

function statusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'available') return 'badge-good';
  if (s === 'booked') return 'badge-pending';
  if (s === 'checking-out') return 'badge-checkout';
  if (s === 'maintenance') return 'badge-inactive';
  return 'badge-active';
}

function roomStatusChip(displayStatus) {
  const s = (displayStatus || '').toLowerCase();
  if (s === 'booked') return 'Occupied';
  if (s === 'available') return 'Vacant';
  if (s === 'maintenance') return 'Maintenance';
  return 'Occupied';
}

function initials(name) {
  const val = String(name || 'Guest').trim();
  if (!val) return 'G';
  const parts = val.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'G';
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

export default function RoomsPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  const { data: roomsData, isLoading, error } = useQuery({
    queryKey: ['rooms'],
    queryFn: getRooms,
  });

  const { data: guestBookingsData } = useQuery({
    queryKey: ['guest-bookings', 'for-rooms'],
    queryFn: () => getGuestBookings({ limit: 300 }),
  });

  const { data: selectedRoomData, isLoading: loadingDetail } = useQuery({
    queryKey: ['room', selectedId],
    queryFn: () => getRoom(selectedId),
    enabled: !!selectedId,
  });

  const { data: roomBookingsData, isFetched: roomBookingsFetched } = useQuery({
    queryKey: ['room-bookings', selectedId],
    queryFn: () => getRoomBookings(selectedId),
    enabled: !!selectedId,
  });
  const roomBookingsList = Array.isArray(roomBookingsData) ? roomBookingsData : (Array.isArray(roomBookingsData?.data) ? roomBookingsData.data : []);

  const roomsRaw = Array.isArray(roomsData) ? roomsData : (roomsData?.data ?? []);
  const guestBookingsList = Array.isArray(guestBookingsData) ? guestBookingsData : (guestBookingsData?.data ?? []);

  const nextBookingByRoomId = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map();
    guestBookingsList
      .filter((b) => {
        const st = (b.status || '').toLowerCase();
        if (st === 'cancelled') return false;
        const out = b.checkOut ? parseLocalDate(b.checkOut) : null;
        return out && out >= today;
      })
      .sort((a, b) => (parseLocalDate(a.checkIn)?.getTime() ?? 0) - (parseLocalDate(b.checkIn)?.getTime() ?? 0))
      .forEach((b) => {
        const rid = b.roomId ?? b.room?._id ?? b.room;
        const id = typeof rid === 'object' ? rid?._id : rid;
        if (id && !map.has(id)) map.set(id, b);
      });
    return map;
  }, [guestBookingsList]);

  const filteredRooms = useMemo(() => {
    let list = roomsRaw;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          String(r.name || '').toLowerCase().includes(q) ||
          String(r.type || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      list = list.filter((r) => getRoomStatus(r) === statusFilter);
    }
    if (typeFilter) {
      list = list.filter((r) => String(r.type || '').toLowerCase() === typeFilter);
    }
    return list;
  }, [roomsRaw, search, statusFilter, typeFilter]);

  const selectedRoom = selectedRoomData?.data ?? selectedRoomData ?? roomsRaw.find((r) => (r._id ?? r.id) === selectedId);

  useEffect(() => {
    if (!selectedId) return undefined;
    const t = new Date();
    setCalendarMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const modalBookings = useMemo(() => {
    if (!selectedId) return [];
    const fromApi = Array.isArray(roomBookingsList) ? roomBookingsList : [];
    const sortAndFilter = (list) =>
      [...list]
        .filter((b) => (b.status || '').toLowerCase() !== 'cancelled')
        .sort((a, b) => (parseLocalDate(a.checkIn)?.getTime() ?? 0) - (parseLocalDate(b.checkIn)?.getTime() ?? 0));
    if (roomBookingsFetched) {
      return sortAndFilter(fromApi);
    }
    const fromGuest = guestBookingsList.filter((b) => {
      if ((b.status || '').toLowerCase() === 'cancelled') return false;
      const rid = b.roomId ?? b.room?._id ?? b.room;
      const id = typeof rid === 'object' ? rid?._id : rid;
      return id === selectedId;
    });
    return sortAndFilter(fromGuest);
  }, [selectedId, roomBookingsList, roomBookingsFetched, guestBookingsList]);

  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);

  const todayLocal = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateRoom(id, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room', id] });
    },
  });

  function setRoomStatus(roomId, status) {
    updateMutation.mutate({
      id: roomId,
      body: {
        status,
        ...(status === 'available' ? { isAvailable: true } : status === 'maintenance' ? { isAvailable: false } : {}),
      },
    });
  }

  function shiftCalendarMonth(delta) {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <div className="rooms-page rooms-page--reference">
      <header className="rooms-page-header">
        <div className="rooms-page-header-inner">
          <div className="rooms-page-title-wrap">
            <div>
              <h1 className="rooms-page-title">Room Overview</h1>
              <p className="rooms-page-subtitle">{fmtOverviewDate()} · All floors · Click a room for its booking calendar</p>
            </div>
          </div>
          <div className="rooms-header-actions">
            <button type="button" className="btn btn-outline btn-sm rooms-top-action"><i className="fas fa-download" /> Export</button>
            <button type="button" className="btn btn-outline btn-sm rooms-top-action"><i className="fas fa-plus" /> New booking</button>
          </div>
        </div>
      </header>

      <div className="rooms-filters-bar">
        <div className="rooms-filters-title-wrap">
          <div className="rooms-filters-title">All rooms</div>
          <p className="rooms-click-hint" role="note">
            <i className="fas fa-calendar-alt" aria-hidden />
            <span>Select a room to see who booked and when</span>
          </p>
        </div>
        <div className="rooms-status-tabs">
          <button type="button" className={`rooms-status-tab ${statusFilter === '' ? 'active' : ''}`} onClick={() => setStatusFilter('')}>All</button>
          <button type="button" className={`rooms-status-tab ${statusFilter === 'booked' ? 'active' : ''}`} onClick={() => setStatusFilter('booked')}>Occupied</button>
          <button type="button" className={`rooms-status-tab ${statusFilter === 'available' ? 'active' : ''}`} onClick={() => setStatusFilter('available')}>Vacant</button>
          <button type="button" className={`rooms-status-tab ${statusFilter === 'maintenance' ? 'active' : ''}`} onClick={() => setStatusFilter('maintenance')}>Maintenance</button>
        </div>
      </div>

      {error && (
        <div className="card card--error">
          <div className="card-body">{error.message}</div>
        </div>
      )}

      <div className="rooms-layout">
        <div className="rooms-main">
          {isLoading && (
            <div className="rooms-loading">Loading rooms…</div>
          )}
          {!isLoading && filteredRooms.length === 0 && (
            <div className="rooms-empty">No rooms match your filters.</div>
          )}
          {!isLoading && viewMode === 'grid' && filteredRooms.length > 0 && (
            <div className="rooms-grid">
              {filteredRooms.map((room) => {
                const id = room._id ?? room.id;
                const nextBooking = nextBookingByRoomId.get(id);
                const displayStatus = getDisplayStatus(room, nextBooking);
                const roomLabel = room.name || 'Unnamed room';
                return (
                  <button
                    key={id}
                    type="button"
                    className={`rooms-card rooms-card--opens-calendar ${selectedId === id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(id)}
                    title={`Open booking calendar — ${roomLabel}`}
                    aria-label={`${roomLabel}: open guest booking calendar`}
                  >
                    <div className="rooms-card-photo-wrap">
                      <div
                        className="rooms-card-photo"
                        style={{ backgroundImage: `url(${getRoomImage(room)})` }}
                      />
                      <div className="rooms-card-topline">
                        <span className="rooms-card-floor">{String(room.floor || 'Floor 1').toUpperCase()}</span>
                        <span className={`rooms-card-badge rooms-chip-${displayStatus}`}>
                          {roomStatusChip(displayStatus)}
                        </span>
                      </div>
                    </div>
                    <div className="rooms-card-body">
                      <div className="rooms-card-top">
                        <span className="rooms-card-name">{room.name || 'Unnamed room'}</span>
                        <span className="rooms-card-rate">R {fmtNum(room.pricePerNight)}<small>/nt</small></span>
                      </div>
                      <div className="rooms-card-type">{room.type || 'Standard Double'}</div>
                      {nextBooking ? (
                        <div className={`rooms-card-next ${getBookingTimeLabel(nextBooking) === 'Current' ? 'rooms-card-next--current' : ''}`} title={`${getBookingTimeLabel(nextBooking)}: ${nextBooking.guestName || 'Guest'} ${nextBooking.checkIn} – ${nextBooking.checkOut}`}>
                          <div className="rooms-card-checkin-line">
                            <i className="fas fa-sign-in-alt" />
                            <span>
                              {getBookingTimeLabel(nextBooking) === 'Current' ? 'Checked in' : 'Checking in'} {fmtDate(nextBooking.checkIn)}
                            </span>
                          </div>
                          <div className="rooms-card-guest-row">
                            <span className="rooms-card-guest-avatar">{initials(nextBooking.guestName)}</span>
                            <span className="rooms-card-guest-name">{nextBooking.guestName || 'Guest'}</span>
                          </div>
                          <div className="rooms-card-date-row">
                            <span>In {fmtDate(nextBooking.checkIn)}</span>
                            <span>Out {fmtDate(nextBooking.checkOut)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rooms-card-vacant-note">Available</div>
                      )}
                      <div className="rooms-card-calendar-hint" aria-hidden>
                        <i className="fas fa-calendar-alt" />
                        <span>View calendar</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!isLoading && viewMode === 'list' && filteredRooms.length > 0 && (
            <div className="card rooms-list-card">
              <div className="card-body rooms-list-card-body">
                <div className="rooms-list">
                  {filteredRooms.map((room) => {
                    const id = room._id ?? room.id;
                    const nextBooking = nextBookingByRoomId.get(id);
                    const displayStatus = getDisplayStatus(room, nextBooking);
                    const listRoomLabel = room.name || 'Unnamed room';
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`rooms-list-row rooms-list-row--opens-calendar ${selectedId === id ? 'selected' : ''}`}
                        onClick={() => setSelectedId(id)}
                        title={`Open booking calendar — ${listRoomLabel}`}
                        aria-label={`${listRoomLabel}: open guest booking calendar`}
                      >
                        <div
                          className="rooms-list-photo"
                          style={{ backgroundImage: `url(${getRoomImage(room)})` }}
                        />
                        <div className="rooms-list-info">
                          <span className="rooms-list-name">{room.name || 'Unnamed room'}</span>
                          <span className="rooms-list-type">{room.type || '—'}</span>
                          <span className="rooms-list-calendar-hint-inline" aria-hidden>
                            <i className="fas fa-calendar-alt" /> View booking calendar
                          </span>
                        </div>
                        <div className="rooms-list-specs">
                          {(room.bedConfig || room.beds || room.capacity) && <span>{room.bedConfig || room.beds || room.capacity}</span>}
                          {room.bathroom && <span>{room.bathroom}</span>}
                          {room.view && <span>{room.view}</span>}
                        </div>
                        <div className="rooms-list-rate">R {fmtNum(room.pricePerNight)}</div>
                        <span className={`badge ${statusBadgeClass(displayStatus)}`}>
                          {ROOM_STATUSES.find((s) => s.value === displayStatus)?.label ?? displayStatus}
                        </span>
                        <div className={`rooms-list-next ${nextBooking && getBookingTimeLabel(nextBooking) === 'Current' ? 'rooms-list-next--current' : ''}`}>
                          {nextBooking ? (
                            <>
                              <div className="rooms-list-checkin-line">
                                <i className="fas fa-sign-in-alt" />
                                <span>{getBookingTimeLabel(nextBooking) === 'Current' ? 'Checked in' : 'Checking in'} {fmtDate(nextBooking.checkIn)}</span>
                              </div>
                              <div>{`${getBookingTimeLabel(nextBooking)}: ${nextBooking.guestName || 'Guest'} · ${fmtDate(nextBooking.checkIn)} – ${fmtDate(nextBooking.checkOut)}`}</div>
                            </>
                          ) : '—'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="rooms-detail-panel">
          {!selectedId && (
            <div className="rooms-detail-empty">
              <span className="rooms-detail-empty-icon"><i className="fas fa-hand-pointer" /></span>
              <p>Click a room to view details</p>
            </div>
          )}
          {selectedId && loadingDetail && !selectedRoom && (
            <div className="rooms-detail-loading">Loading…</div>
          )}
          {selectedId && selectedRoom && (() => {
            const selectedDisplayStatus = getDisplayStatus(selectedRoom, nextBookingByRoomId.get(selectedRoom._id ?? selectedRoom.id));
            return (
            <div className="rooms-detail-content">
              <div
                className="rooms-detail-hero"
                style={{ backgroundImage: `url(${getRoomImage(selectedRoom)})` }}
              />
              <div className="rooms-detail-header">
                <h3>{selectedRoom.name || 'Unnamed room'}</h3>
                <span className={`badge ${statusBadgeClass(selectedDisplayStatus)}`}>
                  {ROOM_STATUSES.find((s) => s.value === selectedDisplayStatus)?.label ?? selectedDisplayStatus}
                </span>
              </div>

              <div className="review-block">
                <div className="review-block-header">Room specs</div>
                <div className="review-row"><div className="rv-label">Capacity</div><div className="rv-val">{selectedRoom.capacity ?? '—'}</div></div>
                <div className="review-row"><div className="rv-label">Bed</div><div className="rv-val">{selectedRoom.bedConfig || selectedRoom.beds || '—'}</div></div>
                <div className="review-row"><div className="rv-label">Bathroom</div><div className="rv-val">{selectedRoom.bathroom ?? '—'}</div></div>
                <div className="review-row"><div className="rv-label">View</div><div className="rv-val">{selectedRoom.view ?? '—'}</div></div>
                <div className="review-row"><div className="rv-label">Rate</div><div className="rv-val">R {fmtNum(selectedRoom.pricePerNight)}/night</div></div>
              </div>

              {selectedRoom.amenities && selectedRoom.amenities.length > 0 && (
                <div className="review-block">
                  <div className="review-block-header">Amenities</div>
                  <div className="rooms-amenities">
                    {selectedRoom.amenities.map((a, i) => (
                      <span key={i} className="rooms-amenity-tag">{typeof a === 'string' ? a : a.name || a.label}</span>
                    ))}
                  </div>
                </div>
              )}

              {(roomBookingsList.length > 0 || nextBookingByRoomId.get(selectedRoom._id ?? selectedRoom.id)) && (
                <div className="review-block">
                  <div className="review-block-header">Who booked this room</div>
                  {roomBookingsList.length > 0 ? (
                    <ul className="rooms-room-bookings-list">
                      {roomBookingsList.map((b) => (
                        <li key={b._id ?? b.id}>
                          <span className="rooms-booking-guest">{b.guestName || 'Guest'}</span>
                          <span className="rooms-booking-dates">{fmtDate(b.checkIn)} – {fmtDate(b.checkOut)}</span>
                          {b.trackingCode && <span className="rooms-booking-code">{b.trackingCode}</span>}
                          <span className={`badge ${(b.status || '').toLowerCase() === 'confirmed' ? 'badge-confirmed' : (b.status || '').toLowerCase() === 'cancelled' ? 'badge-cancelled' : 'badge-pending'}`}>
                            {(b.status || 'pending').replace(/-/g, ' ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (() => {
                    const nextB = nextBookingByRoomId.get(selectedRoom._id ?? selectedRoom.id);
                    return nextB ? (
                      <div className="rooms-upcoming-booking">
                        <div className="rooms-upcoming-guest">{nextB.guestName || 'Guest'}</div>
                        <div className="rooms-upcoming-dates">{fmtDate(nextB.checkIn)} – {fmtDate(nextB.checkOut)}</div>
                        <span className={`badge ${(nextB.status || '').toLowerCase() === 'confirmed' ? 'badge-confirmed' : 'badge-pending'}`}>
                          {(nextB.status || 'pending').replace(/-/g, ' ')}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              <div className="review-block">
                <div className="review-block-header">Status</div>
                <div className="rooms-status-pills">
                  {ROOM_STATUSES.map((s) => {
                    const current = getRoomStatus(selectedRoom);
                    const active = current === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        className={`rooms-status-pill ${active ? 'active' : ''} ${statusBadgeClass(s.value)}`}
                        onClick={() => setRoomStatus(selectedRoom._id ?? selectedRoom.id, s.value)}
                        disabled={updateMutation.isPending}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rooms-detail-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => {}}>Book this room</button>
                <button type="button" className="btn btn-outline btn-sm">Edit details</button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setRoomStatus(selectedRoom._id ?? selectedRoom.id, 'maintenance')}
                  disabled={updateMutation.isPending}
                >
                  Mark as maintenance
                </button>
              </div>
            </div>
            );
          })()}
        </aside>
      </div>

      {selectedId && (
        <div
          className="rooms-events-modal-overlay"
          onClick={() => setSelectedId(null)}
          role="presentation"
        >
          <div className="rooms-events-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rooms-events-title">
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="rooms-events-title" className="rooms-events-modal-title">
                  {selectedRoom?.name || 'Room'}
                </h2>
                <p className="rooms-events-modal-sub">Guest bookings calendar</p>
              </div>
              <button type="button" className="rooms-events-modal-close" onClick={() => setSelectedId(null)} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              {loadingDetail && !selectedRoom && <p className="rooms-events-loading">Loading room…</p>}
              {selectedRoom && (
                <>
                  <div className="rooms-events-cal-nav">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => shiftCalendarMonth(-1)} aria-label="Previous month">
                      <i className="fas fa-chevron-left" />
                    </button>
                    <span className="rooms-events-cal-label">
                      {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                    </span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => shiftCalendarMonth(1)} aria-label="Next month">
                      <i className="fas fa-chevron-right" />
                    </button>
                  </div>
                  <div className="rooms-events-cal-grid">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                      <div key={d} className="rooms-events-cal-dow">{d}</div>
                    ))}
                    {calendarCells.map((cell) => {
                      const guestsOnDay = modalBookings
                        .filter((b) => bookingOverlapsDay(b, cell.date))
                        .map((b) => b.guestName || 'Guest');
                      const uniqueGuests = [...new Set(guestsOnDay)];
                      const isToday = sameDay(cell.date, todayLocal);
                      return (
                        <div
                          key={cell.key}
                          className={`rooms-events-cal-cell ${cell.inMonth ? 'in-month' : 'out-month'} ${uniqueGuests.length ? 'has-booking' : ''} ${isToday ? 'is-today' : ''}`}
                        >
                          <span className="rooms-events-cal-daynum">{cell.date.getDate()}</span>
                          {uniqueGuests.length > 0 && (
                            <span className="rooms-events-cal-guest" title={uniqueGuests.join(', ')}>
                              {uniqueGuests[0]}{uniqueGuests.length > 1 ? ` +${uniqueGuests.length - 1}` : ''}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="rooms-events-bookings">
                    <h3 className="rooms-events-bookings-title">Who booked</h3>
                    {modalBookings.length === 0 ? (
                      <p className="rooms-events-empty">No bookings for this room.</p>
                    ) : (
                      <ul className="rooms-events-bookings-list">
                        {modalBookings.map((b) => (
                          <li key={b._id ?? b.id ?? `${b.guestName}-${b.checkIn}`}>
                            <span className="rooms-events-b-name">{b.guestName || 'Guest'}</span>
                            <span className="rooms-events-b-dates">{fmtDate(b.checkIn)} – {fmtDate(b.checkOut)}</span>
                            <span className={`rooms-events-b-status ${(b.status || '').toLowerCase() === 'confirmed' ? 'confirmed' : ''}`}>
                              {(b.status || 'pending').replace(/-/g, ' ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
