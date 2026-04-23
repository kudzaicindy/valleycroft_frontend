import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resolveApiBaseUrl } from '@/api/resolveApiBaseUrl';
import { useAuth } from '@/context/AuthContext';
import {
  getRooms,
  getRoom,
  getRoomBookings,
  updateRoom,
  createRoom,
  deleteRoom,
  uploadRoomImages,
  normalizeRoomImageUploadResult,
} from '@/api/rooms';
import { getGuestBookings } from '@/api/guestBookings';
import { parseLocalDate } from '@/utils/availability';
import { formatDateDayMonthYear, formatDateWeekdayDayMonthYear, formatMonthYear } from '@/utils/formatDate';
import { resolveRoomImageUrl } from '@/utils/roomImageUrl';

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
  { value: 'event-venue', label: 'Event venue' },
  { value: 'garden-venue', label: 'Garden venue' },
  { value: 'conference-venue', label: 'Conference venue' },
  { value: 'wedding-venue', label: 'Wedding venue' },
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
  const eventFallbackByName = String(room?.name || '').toLowerCase().includes('pool')
    ? '/pool.jpeg'
    : '/WhatsApp Image 2026-04-15 at 09.24.26 (1).jpeg';
  const fallback = room?.isEventSpace ? resolveRoomImageUrl(eventFallbackByName) : 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&h=300&fit=crop';
  if (!raw) return fallback;
  if (/^s3:\/\//i.test(raw) || /^https?:\/\//i.test(raw) || /^data:/i.test(raw)) {
    return resolveRoomImageUrl(raw) || fallback;
  }
  const apiBase = resolveApiBaseUrl();
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return `${apiBase}${withSlash}`;
}

function fmtDate(val) {
  return formatDateDayMonthYear(val);
}

function fmtNum(n) {
  return n != null ? Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 }) : '—';
}

function fmtOverviewDate() {
  return formatDateWeekdayDayMonthYear(new Date());
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

function parseImageLines(text) {
  return String(text || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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
  const location = useLocation();
  const { user } = useAuth();
  const isAdminPath = location.pathname.startsWith('/admin');
  const isAdminRole = String(user?.role || '').toLowerCase() === 'admin';
  const isAdmin = isAdminPath || isAdminRole;
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [newSpaceCategory, setNewSpaceCategory] = useState('room');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('cottage');
  const [newRoomPrice, setNewRoomPrice] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('1');
  const [newRoomCapacity, setNewRoomCapacity] = useState('2');
  const [newRoomBeds, setNewRoomBeds] = useState('');
  const [newRoomImagesText, setNewRoomImagesText] = useState('');
  const [editName, setEditName] = useState('');
  const [editSpaceCategory, setEditSpaceCategory] = useState('room');
  const [editType, setEditType] = useState('cottage');
  const [editCapacity, setEditCapacity] = useState('');
  const [editBeds, setEditBeds] = useState('');
  const [editBathroom, setEditBathroom] = useState('');
  const [editView, setEditView] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editImagesText, setEditImagesText] = useState('');
  const [editImageFiles, setEditImageFiles] = useState([]);
  const [newRoomImageFiles, setNewRoomImageFiles] = useState([]);
  const editFileInputRef = useRef(null);
  const newRoomFileInputRef = useRef(null);

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
      if (e.key !== 'Escape') return;
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        return;
      }
      if (calendarOpen) {
        setCalendarOpen(false);
        return;
      }
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, calendarOpen, deleteConfirmOpen]);

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

  const createRoomMutation = useMutation({
    mutationFn: async ({ body, files }) => {
      const res = await createRoom(body);
      const room = res?.data;
      const newId = room?._id ?? room?.id;
      if (newId && files?.length) {
        const uploaded = await uploadRoomImages(newId, files);
        const newUrls = normalizeRoomImageUploadResult(uploaded);
        if (newUrls.length) {
          await updateRoom(newId, { images: [...(body.images || []), ...newUrls] });
        }
      }
      return { res, newId };
    },
    onSuccess: ({ newId }) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      if (newId) queryClient.invalidateQueries({ queryKey: ['room', newId] });
      setAddRoomOpen(false);
      setNewSpaceCategory('room');
      setNewRoomName('');
      setNewRoomType('cottage');
      setNewRoomPrice('');
      setNewRoomFloor('1');
      setNewRoomCapacity('2');
      setNewRoomBeds('');
      setNewRoomImagesText('');
      setNewRoomImageFiles([]);
      if (newRoomFileInputRef.current) newRoomFileInputRef.current.value = '';
      if (newId) setSelectedId(String(newId));
    },
  });

  const adminRoomSaveMutation = useMutation({
    mutationFn: async ({ id, body, files }) => {
      let images = [...(body.images || [])];
      if (files?.length) {
        const uploaded = await uploadRoomImages(id, files);
        const newUrls = normalizeRoomImageUploadResult(uploaded);
        images = [...images, ...newUrls];
      }
      return updateRoom(id, { ...body, images });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room', id] });
      setEditImageFiles([]);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (id) => deleteRoom(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room', id] });
      queryClient.invalidateQueries({ queryKey: ['room-bookings', id] });
      setDeleteConfirmOpen(false);
      setSelectedId(null);
    },
  });

  const editPreviewUrls = useMemo(() => editImageFiles.map((f) => URL.createObjectURL(f)), [editImageFiles]);
  useEffect(() => {
    return () => editPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [editPreviewUrls]);

  const newRoomPreviewUrls = useMemo(() => newRoomImageFiles.map((f) => URL.createObjectURL(f)), [newRoomImageFiles]);
  useEffect(() => {
    return () => newRoomPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [newRoomPreviewUrls]);

  useEffect(() => {
    if (!selectedRoom) return;
    setEditName(String(selectedRoom.name || ''));
    setEditSpaceCategory(selectedRoom.isEventSpace ? 'event' : 'room');
    setEditType(String(selectedRoom.type || 'cottage'));
    setEditCapacity(selectedRoom.capacity != null ? String(selectedRoom.capacity) : '');
    setEditBeds(String(selectedRoom.bedConfig || selectedRoom.beds || ''));
    setEditBathroom(String(selectedRoom.bathroom ?? ''));
    setEditView(String(selectedRoom.view ?? ''));
    setEditPrice(String(selectedRoom.pricePerNight ?? ''));
    const imgs = Array.isArray(selectedRoom.images) ? selectedRoom.images : [];
    setEditImagesText(
      imgs
        .map((i) => (typeof i === 'string' ? i : i?.url || i?.path || i?.src || ''))
        .filter(Boolean)
        .join('\n')
    );
    setEditImageFiles([]);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  }, [
    selectedRoom?._id,
    selectedRoom?.id,
    selectedRoom?.images,
    selectedRoom?.name,
    selectedRoom?.type,
    selectedRoom?.pricePerNight,
    selectedRoom?.capacity,
    selectedRoom?.bedConfig,
    selectedRoom?.bathroom,
    selectedRoom?.view,
  ]);

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

  function handleAddRoomSubmit(e) {
    e.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    const price = Number(newRoomPrice);
    createRoomMutation.mutate({
      body: {
        name,
        type: newRoomType || 'cottage',
        category: newSpaceCategory,
        isEventSpace: newSpaceCategory === 'event',
        pricePerNight: Number.isFinite(price) && price >= 0 ? price : 0,
        floor: newRoomFloor.trim() || '1',
        capacity: Math.max(1, Number(newRoomCapacity) || 2),
        ...(newRoomBeds.trim() ? { bedConfig: newRoomBeds.trim() } : {}),
        images: parseImageLines(newRoomImagesText),
        status: 'available',
        isAvailable: true,
      },
      files: newRoomImageFiles,
    });
  }

  function handleAdminRoomSave(e) {
    e.preventDefault();
    if (!selectedRoom) return;
    if (!editName.trim()) return;
    const id = selectedRoom._id ?? selectedRoom.id;
    if (!id) return;
    const price = Number(editPrice);
    const body = {
      name: editName.trim(),
      type: editType || 'cottage',
      category: editSpaceCategory,
      isEventSpace: editSpaceCategory === 'event',
      pricePerNight: Number.isFinite(price) && price >= 0 ? price : 0,
      images: parseImageLines(editImagesText),
    };
    if (editCapacity.trim()) body.capacity = Math.max(1, Number(editCapacity) || 1);
    if (editBeds.trim()) body.bedConfig = editBeds.trim();
    if (editBathroom.trim()) body.bathroom = editBathroom.trim();
    if (editView.trim()) body.view = editView.trim();
    adminRoomSaveMutation.mutate({ id, body, files: editImageFiles });
  }

  function handleDeleteSelectedSpace() {
    if (!selectedRoom) return;
    setDeleteConfirmOpen(true);
  }

  function confirmDeleteSelectedSpace() {
    if (!selectedRoom) return;
    const id = selectedRoom._id ?? selectedRoom.id;
    if (!id || deleteRoomMutation.isPending) return;
    deleteRoomMutation.mutate(id);
  }

  return (
    <div className={`rooms-page rooms-page--reference rooms-page--modal-details ${isAdmin ? 'rooms-page--admin' : ''}`}>
      <header className="rooms-page-header">
        <div className="rooms-page-header-inner">
          <div className="rooms-page-title-wrap">
            <div>
              <h1 className="rooms-page-title">Rooms & Event Places</h1>
              <p className="rooms-page-subtitle">{fmtOverviewDate()} · All spaces · Click an item for its booking calendar</p>
            </div>
          </div>
          <div className="rooms-header-actions">
            <button type="button" className="btn btn-outline btn-sm rooms-top-action">
              <i className="fas fa-download" /> Export
            </button>
            {isAdmin ? (
              <button
                type="button"
                className="btn btn-primary btn-sm rooms-top-action"
                onClick={() => setAddRoomOpen(true)}
              >
                <i className="fas fa-plus" /> Add space
              </button>
            ) : null}
            <Link to={isAdmin ? '/admin/bookings' : '/booking'} className="btn btn-outline btn-sm rooms-top-action">
              <i className="fas fa-calendar-plus" /> New booking
            </Link>
          </div>
        </div>
      </header>

      <div className="rooms-filters-bar">
        <div className="rooms-filters-title-wrap">
          <div className="rooms-filters-title">All spaces</div>
          <p className="rooms-click-hint" role="note">
            <i className="fas fa-calendar-alt" aria-hidden />
            <span>Select a space to see who booked and when</span>
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
                    onClick={() => {
                      setSelectedId(id);
                      setCalendarOpen(false);
                    }}
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
                        onClick={() => {
                          setSelectedId(id);
                          setCalendarOpen(false);
                        }}
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
              <p>Click a room or Event Hire space to view details</p>
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
                <div className="review-block-header">Space details</div>
                <div className="review-row"><div className="rv-label">Capacity</div><div className="rv-val">{selectedRoom.capacity ?? '—'}</div></div>
                <div className="review-row"><div className="rv-label">Bed</div><div className="rv-val">{selectedRoom.bedConfig || selectedRoom.beds || '—'}</div></div>
                <div className="review-row"><div className="rv-label">Bathroom</div><div className="rv-val">{selectedRoom.bathroom ?? '—'}</div></div>
                <div className="review-row"><div className="rv-label">View</div><div className="rv-val">{selectedRoom.view ?? '—'}</div></div>
                <div className="review-row"><div className="rv-label">Rate</div><div className="rv-val">R {fmtNum(selectedRoom.pricePerNight)}/night</div></div>
              </div>

              {isAdmin && (
                <div className="review-block">
                  <div className="review-block-header">Edit space (admin)</div>
                  <p className="rooms-admin-hint" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Update details, price, and photos. Uploads use <code>POST /api/rooms/:id/images</code> (multipart field{' '}
                    <code>images</code>), then <code>PUT /api/rooms/:id</code> merges returned paths with existing gallery.
                  </p>
                  <form className="form-stack" onSubmit={handleAdminRoomSave}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-name">
                        Space name *
                      </label>
                      <input
                        id="room-edit-name"
                        className="form-control"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-category">
                        Space category
                      </label>
                      <select
                        id="room-edit-category"
                        className="form-control"
                        value={editSpaceCategory}
                        onChange={(e) => setEditSpaceCategory(e.target.value)}
                      >
                        <option value="room">Room</option>
                        <option value="event">Event Hire</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-type">
                        Type
                      </label>
                      <select
                        id="room-edit-type"
                        className="form-control"
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                      >
                        {ROOM_TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-cap">
                        Capacity (guests)
                      </label>
                      <input
                        id="room-edit-cap"
                        type="number"
                        min={1}
                        className="form-control"
                        value={editCapacity}
                        onChange={(e) => setEditCapacity(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-beds">
                        Bed configuration
                      </label>
                      <input
                        id="room-edit-beds"
                        className="form-control"
                        value={editBeds}
                        onChange={(e) => setEditBeds(e.target.value)}
                        placeholder="e.g. King + single"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-bath">
                        Bathroom
                      </label>
                      <input
                        id="room-edit-bath"
                        className="form-control"
                        value={editBathroom}
                        onChange={(e) => setEditBathroom(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-view">
                        View
                      </label>
                      <input
                        id="room-edit-view"
                        className="form-control"
                        value={editView}
                        onChange={(e) => setEditView(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-price">
                        Price per night (R)
                      </label>
                      <input
                        id="room-edit-price"
                        type="number"
                        min={0}
                        step={1}
                        className="form-control"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-upload">
                        Upload photos
                      </label>
                      <input
                        ref={editFileInputRef}
                        id="room-edit-upload"
                        type="file"
                        accept="image/*"
                        multiple
                        className="form-control"
                        onChange={(e) => setEditImageFiles(Array.from(e.target.files || []))}
                      />
                      {editImageFiles.length > 0 ? (
                        <div className="rooms-admin-upload-meta">
                          <span>{editImageFiles.length} file(s) selected</span>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setEditImageFiles([]);
                              if (editFileInputRef.current) editFileInputRef.current.value = '';
                            }}
                          >
                            Clear uploads
                          </button>
                        </div>
                      ) : null}
                      {editPreviewUrls.length > 0 ? (
                        <div className="rooms-admin-upload-previews">
                          {editPreviewUrls.map((url, i) => (
                            <img key={`${url}-${i}`} src={url} alt="" className="rooms-admin-upload-thumb" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-images">
                        Extra image URLs (optional, one per line)
                      </label>
                      <textarea
                        id="room-edit-images"
                        className="form-control"
                        rows={3}
                        value={editImagesText}
                        onChange={(e) => setEditImagesText(e.target.value)}
                        placeholder="https://… or /uploads/…"
                      />
                    </div>
                    {adminRoomSaveMutation.isError && (
                      <div className="card card--error" style={{ marginBottom: 8 }}>
                        <div className="card-body" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          {adminRoomSaveMutation.error?.message || 'Could not save space.'}
                        </div>
                      </div>
                    )}
                    <button type="submit" className="btn btn-primary btn-sm" disabled={adminRoomSaveMutation.isPending}>
                      {adminRoomSaveMutation.isPending ? 'Saving…' : 'Save space'}
                    </button>
                  </form>
                </div>
              )}

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
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setCalendarOpen(true);
                  }}
                >
                  View calendar
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setRoomStatus(selectedRoom._id ?? selectedRoom.id, 'maintenance')}
                  disabled={updateMutation.isPending}
                >
                  Mark as maintenance
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleDeleteSelectedSpace}
                    disabled={deleteRoomMutation.isPending}
                    title="Delete selected room or Event Hire space"
                    style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                  >
                    {deleteRoomMutation.isPending ? (
                      'Deleting…'
                    ) : (
                      <>
                        <i className="fas fa-trash" /> Delete
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              {isAdmin && deleteRoomMutation.isError ? (
                <div className="card card--error" style={{ marginTop: 10 }}>
                  <div className="card-body" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {deleteRoomMutation.error?.message || 'Could not delete this space.'}
                  </div>
                </div>
              ) : null}
            </div>
            );
          })()}
        </aside>
      </div>

      {selectedId && calendarOpen && (
        <div
          className="rooms-events-modal-overlay"
          onClick={() => setCalendarOpen(false)}
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
              <button type="button" className="rooms-events-modal-close" onClick={() => setCalendarOpen(false)} aria-label="Close">
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
                      {formatMonthYear(calendarMonth)}
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

      {selectedId && selectedRoom && !calendarOpen && (
        <div className="rooms-events-modal-overlay" onClick={() => setSelectedId(null)} role="presentation">
          <div className="rooms-events-modal rooms-detail-edit-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="room-detail-modal-title">
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="room-detail-modal-title" className="rooms-events-modal-title">
                  {selectedRoom.name || 'Room details'}
                </h2>
                <p className="rooms-events-modal-sub">Room details and updates</p>
              </div>
              <button type="button" className="rooms-events-modal-close" onClick={() => setSelectedId(null)} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              <div className="rooms-detail-compact-card">
                <div className="rooms-detail-corner-thumb-wrap" aria-hidden>
                  <div className="rooms-detail-corner-thumb" style={{ backgroundImage: `url(${getRoomImage(selectedRoom)})` }} />
                </div>
                <div className="review-block rooms-detail-compact-data">
                  <div className="review-block-header rooms-detail-card-header">
                    <span>Space details</span>
                    <span className="rooms-detail-rate-chip">R {fmtNum(selectedRoom.pricePerNight)}/night</span>
                  </div>
                  <div className="rooms-detail-kv-grid">
                    <div className="review-row"><div className="rv-label">Capacity</div><div className="rv-val">{selectedRoom.capacity ?? '—'}</div></div>
                    <div className="review-row"><div className="rv-label">Bed</div><div className="rv-val">{selectedRoom.bedConfig || selectedRoom.beds || '—'}</div></div>
                    <div className="review-row"><div className="rv-label">Bathroom</div><div className="rv-val">{selectedRoom.bathroom ?? '—'}</div></div>
                    <div className="review-row"><div className="rv-label">View</div><div className="rv-val">{selectedRoom.view ?? '—'}</div></div>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="review-block">
                  <div className="review-block-header">Edit space (admin)</div>
                  <form className="form-stack" onSubmit={handleAdminRoomSave}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-name-modal">Space name *</label>
                      <input id="room-edit-name-modal" className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-category-modal">Space category</label>
                      <select id="room-edit-category-modal" className="form-control" value={editSpaceCategory} onChange={(e) => setEditSpaceCategory(e.target.value)}>
                        <option value="room">Room</option>
                        <option value="event">Event Hire</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-type-modal">Type</label>
                      <select id="room-edit-type-modal" className="form-control" value={editType} onChange={(e) => setEditType(e.target.value)}>
                        {ROOM_TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-cap-modal">Capacity (guests)</label>
                      <input id="room-edit-cap-modal" type="number" min={1} className="form-control" value={editCapacity} onChange={(e) => setEditCapacity(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-beds-modal">Bed configuration</label>
                      <input id="room-edit-beds-modal" className="form-control" value={editBeds} onChange={(e) => setEditBeds(e.target.value)} placeholder="e.g. King + single" />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-bath-modal">Bathroom</label>
                      <input id="room-edit-bath-modal" className="form-control" value={editBathroom} onChange={(e) => setEditBathroom(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-view-modal">View</label>
                      <input id="room-edit-view-modal" className="form-control" value={editView} onChange={(e) => setEditView(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-price-modal">Price per night (R)</label>
                      <input id="room-edit-price-modal" type="number" min={0} step={1} className="form-control" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-upload-modal">Upload photos</label>
                      <input
                        ref={editFileInputRef}
                        id="room-edit-upload-modal"
                        type="file"
                        accept="image/*"
                        multiple
                        className="form-control"
                        onChange={(e) => setEditImageFiles(Array.from(e.target.files || []))}
                      />
                      {editImageFiles.length > 0 ? (
                        <div className="rooms-admin-upload-meta">
                          <span>{editImageFiles.length} file(s) selected</span>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setEditImageFiles([]);
                              if (editFileInputRef.current) editFileInputRef.current.value = '';
                            }}
                          >
                            Clear uploads
                          </button>
                        </div>
                      ) : null}
                      {editPreviewUrls.length > 0 ? (
                        <div className="rooms-admin-upload-previews">
                          {editPreviewUrls.map((url, i) => (
                            <img key={`${url}-${i}`} src={url} alt="" className="rooms-admin-upload-thumb" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="room-edit-images-modal">Extra image URLs (optional, one per line)</label>
                      <textarea
                        id="room-edit-images-modal"
                        className="form-control"
                        rows={3}
                        value={editImagesText}
                        onChange={(e) => setEditImagesText(e.target.value)}
                        placeholder="https://… or /uploads/…"
                      />
                    </div>
                    {adminRoomSaveMutation.isError && (
                      <div className="card card--error" style={{ marginBottom: 8 }}>
                        <div className="card-body" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          {adminRoomSaveMutation.error?.message || 'Could not save space.'}
                        </div>
                      </div>
                    )}
                    <div className="bookings-add-internal-actions">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={adminRoomSaveMutation.isPending}>
                        {adminRoomSaveMutation.isPending ? 'Saving…' : 'Save space'}
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setCalendarOpen(true)}>
                        View calendar
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={handleDeleteSelectedSpace}
                        disabled={deleteRoomMutation.isPending}
                        style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                      >
                        {deleteRoomMutation.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && selectedRoom && (
        <div className="rooms-events-modal-overlay" onClick={() => setDeleteConfirmOpen(false)} role="presentation">
          <div
            className="rooms-events-modal rooms-delete-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rooms-delete-confirm-title"
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="rooms-delete-confirm-title" className="rooms-events-modal-title">Delete space?</h2>
                <p className="rooms-events-modal-sub">
                  This will permanently remove <strong>{selectedRoom.name || 'this space'}</strong>.
                </p>
              </div>
              <button type="button" className="rooms-events-modal-close" onClick={() => setDeleteConfirmOpen(false)} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              <p className="rooms-delete-confirm-text">
                This action cannot be undone. Any future selection and updates for this room/event space will no longer be available.
              </p>
              <div className="bookings-add-internal-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteRoomMutation.isPending}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={confirmDeleteSelectedSpace}
                  disabled={deleteRoomMutation.isPending}
                >
                  {deleteRoomMutation.isPending ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && selectedRoom && (
        <div className="rooms-events-modal-overlay" onClick={() => setDeleteConfirmOpen(false)} role="presentation">
          <div
            className="rooms-events-modal rooms-delete-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rooms-delete-confirm-title"
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="rooms-delete-confirm-title" className="rooms-events-modal-title">Delete space?</h2>
                <p className="rooms-events-modal-sub">
                  This will permanently remove <strong>{selectedRoom.name || 'this space'}</strong>.
                </p>
              </div>
              <button type="button" className="rooms-events-modal-close" onClick={() => setDeleteConfirmOpen(false)} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              <p className="rooms-delete-confirm-text">
                This action cannot be undone. Any future selection and updates for this room/event space will no longer be available.
              </p>
              <div className="bookings-add-internal-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteRoomMutation.isPending}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={confirmDeleteSelectedSpace}
                  disabled={deleteRoomMutation.isPending}
                >
                  {deleteRoomMutation.isPending ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {addRoomOpen && isAdmin && (
        <div
          className="rooms-events-modal-overlay"
          onClick={() => {
            if (!createRoomMutation.isPending) setAddRoomOpen(false);
          }}
          role="presentation"
        >
          <div
            className="rooms-events-modal bookings-add-internal-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-room-title"
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="add-room-title" className="rooms-events-modal-title">
                  Add space
                </h2>
                <p className="rooms-events-modal-sub">
                  Creates the space first, then uploads any selected images. Backend: <code>POST /api/rooms/:id/images</code> (field{' '}
                  <code>images</code>).
                </p>
              </div>
              <button
                type="button"
                className="rooms-events-modal-close"
                onClick={() => !createRoomMutation.isPending && setAddRoomOpen(false)}
                aria-label="Close"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              <form className="form-stack" onSubmit={handleAddRoomSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-name">
                    Space name *
                  </label>
                  <input
                    id="add-room-name"
                    className="form-control"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Garden cottage 2"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-space-category">
                    Space category
                  </label>
                  <select
                    id="add-space-category"
                    className="form-control"
                    value={newSpaceCategory}
                    onChange={(e) => setNewSpaceCategory(e.target.value)}
                  >
                    <option value="room">Room</option>
                    <option value="event">Event Hire</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-type">
                    Type
                  </label>
                  <select
                    id="add-room-type"
                    className="form-control"
                    value={newRoomType}
                    onChange={(e) => setNewRoomType(e.target.value)}
                  >
                    {ROOM_TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-price">
                    Price per night (R) *
                  </label>
                  <input
                    id="add-room-price"
                    type="number"
                    min={0}
                    step={1}
                    className="form-control"
                    value={newRoomPrice}
                    onChange={(e) => setNewRoomPrice(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-floor">
                    Floor / wing label
                  </label>
                  <input
                    id="add-room-floor"
                    className="form-control"
                    value={newRoomFloor}
                    onChange={(e) => setNewRoomFloor(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-cap">
                    Capacity (guests)
                  </label>
                  <input
                    id="add-room-cap"
                    type="number"
                    min={1}
                    className="form-control"
                    value={newRoomCapacity}
                    onChange={(e) => setNewRoomCapacity(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-beds">
                    Bed configuration (optional)
                  </label>
                  <input
                    id="add-room-beds"
                    className="form-control"
                    value={newRoomBeds}
                    onChange={(e) => setNewRoomBeds(e.target.value)}
                    placeholder="e.g. King + single"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-upload">
                    Upload photos
                  </label>
                  <input
                    ref={newRoomFileInputRef}
                    id="add-room-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    className="form-control"
                    onChange={(e) => setNewRoomImageFiles(Array.from(e.target.files || []))}
                  />
                  {newRoomImageFiles.length > 0 ? (
                    <div className="rooms-admin-upload-meta">
                      <span>{newRoomImageFiles.length} file(s) selected</span>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setNewRoomImageFiles([]);
                          if (newRoomFileInputRef.current) newRoomFileInputRef.current.value = '';
                        }}
                      >
                        Clear uploads
                      </button>
                    </div>
                  ) : null}
                  {newRoomPreviewUrls.length > 0 ? (
                    <div className="rooms-admin-upload-previews">
                      {newRoomPreviewUrls.map((url, i) => (
                        <img key={`${url}-${i}`} src={url} alt="" className="rooms-admin-upload-thumb" />
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-room-images">
                    Image URLs instead (optional, one per line)
                  </label>
                  <textarea
                    id="add-room-images"
                    className="form-control"
                    rows={2}
                    value={newRoomImagesText}
                    onChange={(e) => setNewRoomImagesText(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                {createRoomMutation.isError && (
                  <div className="card card--error" style={{ marginBottom: 8 }}>
                    <div className="card-body" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
                      {createRoomMutation.error?.message || 'Could not create space.'}
                    </div>
                  </div>
                )}
                <div className="bookings-add-internal-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => !createRoomMutation.isPending && setAddRoomOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={createRoomMutation.isPending}>
                    {createRoomMutation.isPending ? 'Creating…' : 'Create space'}
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
