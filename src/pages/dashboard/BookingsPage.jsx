import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getBookings, getBooking, updateBooking, createBooking } from '@/api/bookings';
import { getGuestBookings, updateGuestBooking } from '@/api/guestBookings';
import { getRooms } from '@/api/rooms';
import { createTransaction } from '@/api/finance';
import { getOccupiedRoomDayKeys } from '@/utils/availability';
import { getApiErrorHint, looksLikeLedgerPostError } from '@/utils/apiError';
import RoomBookingCalendarModal from '@/components/dashboard/RoomBookingCalendarModal';

const LIMIT = 100;
const STATUS_OPTIONS = ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'];
const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked-in', label: 'Checked in' },
  { value: 'checked-out', label: 'Checked out' },
  { value: 'cancelled', label: 'Cancelled' },
];
const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'bnb', label: 'BnB' },
  { value: 'event', label: 'Event' },
];
const WEEKS_VIEW = 2;
const DAYS_IN_VIEW = WEEKS_VIEW * 7;

const GUEST_STATUS_OPTIONS = ['pending', 'confirmed', 'waitlist', 'cancelled'];
const GUEST_STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'cancelled', label: 'Cancelled' },
];

function statusStr(s) {
  if (s == null) return '';
  if (typeof s === 'string') return s;
  if (typeof s === 'object' && s != null && typeof s.value === 'string') return s.value;
  return String(s);
}

function statusBadge(s) {
  const v = statusStr(s).toLowerCase();
  if (v === 'confirmed' || v === 'checked-in' || v === 'checked-out') return 'badge-confirmed';
  if (v === 'cancelled') return 'badge-cancelled';
  return 'badge-pending';
}

function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtNum(n) {
  return n != null ? Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 }) : '—';
}

function roomDisplay(b) {
  const r = b.room ?? b.roomId;
  if (r == null) return '—';
  if (typeof r === 'object' && r.name) return r.name;
  if (typeof r === 'object' && r._id) return r._id;
  return String(r);
}

function fmtRoomGuest(val) {
  if (val == null) return '—';
  if (typeof val === 'object' && typeof val.name === 'string') return val.name;
  if (typeof val === 'object' && val._id) return val._id;
  if (typeof val === 'string') return val;
  return '—';
}

function guestStatusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'confirmed') return 'guest-status--confirmed';
  if (s === 'cancelled') return 'guest-status--cancelled';
  if (s === 'waitlist') return 'guest-status--waitlist';
  return 'guest-status--pending';
}

function referenceDisplay(b) {
  if (b.reference != null) return String(b.reference);
  if (b.bookingReference != null) return String(b.bookingReference);
  const id = b._id;
  if (id != null) return typeof id === 'string' ? id.slice(-8) : String(id).slice(-8);
  return '—';
}

/** Rooms API may return an array or { data | rooms | results }. */
function normalizeRoomsResponse(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.rooms)) return data.rooms;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

/** When GET /rooms is empty or fails, still show rows for rooms referenced on guest bookings. */
function deriveRoomsFromGuestBookings(bookings) {
  const map = new Map();
  const list = Array.isArray(bookings) ? bookings : [];
  for (const b of list) {
    if ((b.status || '').toLowerCase() === 'cancelled') continue;
    const roomObj = typeof b.room === 'object' && b.room != null ? b.room : null;
    const rid = b.roomId ?? roomObj?._id ?? b.room;
    const id = typeof rid === 'object' && rid?._id != null ? rid._id : rid;
    if (id == null || id === '') continue;
    const key = String(id);
    if (map.has(key)) continue;
    const nameFromRoom =
      roomObj?.name ||
      (typeof b.room === 'string' ? b.room : null) ||
      b.roomName;
    const label =
      typeof nameFromRoom === 'string' && nameFromRoom.trim()
        ? nameFromRoom.trim()
        : `Room (${key.length > 8 ? key.slice(-6) : key})`;
    map.set(key, { _id: id, id, name: label });
  }
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function emptyInternalBookingForm() {
  return {
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    type: 'bnb',
    roomId: '',
    checkIn: '',
    checkOut: '',
    amount: '',
    deposit: '',
    notes: '',
  };
}

/** YYYY-MM-DD → local Date at midnight */
function parseYmdLocal(s) {
  if (!s || typeof s !== 'string' || s.length < 10) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Hotel nights: check-out date minus check-in (e.g. 1st→3rd = 2 nights). */
function countStayNights(checkInStr, checkOutStr) {
  const a = parseYmdLocal(checkInStr);
  const b = parseYmdLocal(checkOutStr);
  if (!a || !b) return 0;
  const n = Math.round((b.getTime() - a.getTime()) / 86400000);
  return n > 0 ? n : 0;
}

function roomNightlyRate(room) {
  if (!room) return 0;
  const n = Number(room.pricePerNight ?? room.rate ?? room.price ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatBookingMutationMessage(err, fallback) {
  const message = err?.message || fallback;
  const hint = getApiErrorHint(err);
  const lines = [message];
  if (hint && !message.includes(hint)) lines.push(hint);
  if (looksLikeLedgerPostError(err)) {
    lines.push('Ask an admin to seed accounting on the server (npm run seed:accounting).');
  }
  return lines.join('\n');
}

function normalizeBookingEntity(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.booking && typeof data.booking === 'object') return data.booking;
  if (data.data && typeof data.data === 'object') return data.data;
  return data;
}

export default function BookingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const t = (searchParams.get('tab') || '').toLowerCase();
    if (t === 'guest' || t === 'website') return 'guest';
    if (t === 'availability') return 'availability';
    return 'list';
  }, [searchParams]);

  const setBookingsTab = useCallback(
    (tab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === 'list') next.delete('tab');
          else if (tab === 'guest') next.set('tab', 'guest');
          else if (tab === 'availability') next.set('tab', 'availability');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusSidebar, setStatusSidebar] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [guestPage, setGuestPage] = useState(1);
  const [guestSearch, setGuestSearch] = useState('');
  const [guestStatusFilter, setGuestStatusFilter] = useState('');
  const [guestStatusSidebar, setGuestStatusSidebar] = useState('');
  const [guestSelectedId, setGuestSelectedId] = useState(null);
  const [guestAvailResult, setGuestAvailResult] = useState(null);
  const [guestCheckingAvail, setGuestCheckingAvail] = useState(false);
  const [showAddInternalModal, setShowAddInternalModal] = useState(false);
  const [addInternalForm, setAddInternalForm] = useState(emptyInternalBookingForm);
  const [addInternalAmountManual, setAddInternalAmountManual] = useState(false);
  const [availStart, setAvailStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  /** Room availability tab: open same month calendar modal as Rooms page */
  const [availCalendarRoom, setAvailCalendarRoom] = useState(null);
  const closeAvailCalendar = useCallback(() => setAvailCalendarRoom(null), []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['bookings', page, statusFilter || statusSidebar, typeFilter, search],
    queryFn: () =>
      getBookings({
        page,
        limit: LIMIT,
        ...(statusFilter || statusSidebar ? { status: statusFilter || statusSidebar } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    enabled: activeTab === 'list',
  });

  const rawList = Array.isArray(data) ? data : (data?.data ?? []);
  const list = useMemo(() => {
    if (!search.trim()) return rawList;
    const q = search.trim().toLowerCase();
    return rawList.filter(
      (b) =>
        String(b.guestName || '').toLowerCase().includes(q) ||
        String(b.guestEmail || '').toLowerCase().includes(q) ||
        String(referenceDisplay(b)).toLowerCase().includes(q) ||
        String(roomDisplay(b)).toLowerCase().includes(q)
    );
  }, [rawList, search]);

  const meta = data?.meta ?? {};
  const totalCount = meta.total ?? list.length;

  const { data: selectedBooking, isLoading: loadingDetail } = useQuery({
    queryKey: ['booking', selectedId],
    queryFn: () => getBooking(selectedId),
    enabled: !!selectedId && activeTab === 'list',
  });
  const booking = selectedBooking ?? list.find((b) => b._id === selectedId);

  const {
    data: guestBookingsData,
    isLoading: guestLoading,
    error: guestError,
  } = useQuery({
    queryKey: ['guest-bookings', guestPage, guestStatusFilter || guestStatusSidebar],
    queryFn: () =>
      getGuestBookings({
        page: guestPage,
        limit: LIMIT,
        ...(guestStatusFilter || guestStatusSidebar ? { status: guestStatusFilter || guestStatusSidebar } : {}),
      }),
    enabled: activeTab === 'guest',
  });

  const guestRawList = Array.isArray(guestBookingsData) ? guestBookingsData : (guestBookingsData?.data ?? []);
  const guestList = useMemo(() => {
    if (!guestSearch.trim()) return guestRawList;
    const q = guestSearch.trim().toLowerCase();
    return guestRawList.filter(
      (b) =>
        String(b.guestName || '').toLowerCase().includes(q) ||
        String(b.guestEmail || '').toLowerCase().includes(q) ||
        String(b.trackingCode || '').toLowerCase().includes(q) ||
        fmtRoomGuest(b.room || b.roomId).toLowerCase().includes(q)
    );
  }, [guestRawList, guestSearch]);

  const guestMeta = guestBookingsData?.meta ?? {};
  const guestTotalCount = guestMeta.total ?? guestList.length;
  const guestSelected = guestSelectedId ? guestList.find((b) => b._id === guestSelectedId) : null;

  const { data: roomsData, isPending: roomsPending, isError: roomsIsError, error: roomsErr } = useQuery({
    queryKey: ['rooms'],
    queryFn: getRooms,
    // Load on Bookings page mount so Room availability isn’t empty while the query starts; shares cache with Rooms.
    staleTime: 60 * 1000,
  });

  const { data: availGuestBookings, isPending: availBookingsPending } = useQuery({
    queryKey: ['guest-bookings', 'availability', availStart.toDateString()],
    queryFn: () => getGuestBookings({ limit: 500 }),
    enabled: activeTab === 'availability',
  });
  const allBookingsForAvail = Array.isArray(availGuestBookings) ? availGuestBookings : (availGuestBookings?.data ?? []);

  const roomsFromApi = useMemo(() => normalizeRoomsResponse(roomsData), [roomsData]);
  const roomsFromBookings = useMemo(() => deriveRoomsFromGuestBookings(allBookingsForAvail), [allBookingsForAvail]);

  const addInternalSelectedRoom = useMemo(() => {
    if (!addInternalForm.roomId) return null;
    return roomsFromApi.find((r) => String(r._id ?? r.id) === String(addInternalForm.roomId)) ?? null;
  }, [addInternalForm.roomId, roomsFromApi]);

  const addInternalNights = useMemo(
    () => countStayNights(addInternalForm.checkIn, addInternalForm.checkOut),
    [addInternalForm.checkIn, addInternalForm.checkOut]
  );

  const addInternalNightlyRate = useMemo(() => roomNightlyRate(addInternalSelectedRoom), [addInternalSelectedRoom]);

  const addInternalSuggestedTotal = useMemo(() => {
    if (!addInternalSelectedRoom || addInternalNights <= 0 || addInternalNightlyRate <= 0) return null;
    return Math.round(addInternalNights * addInternalNightlyRate);
  }, [addInternalSelectedRoom, addInternalNights, addInternalNightlyRate]);

  useEffect(() => {
    if (!showAddInternalModal || addInternalAmountManual) return;
    if (addInternalForm.type !== 'bnb') return;
    if (!addInternalForm.roomId) {
      setAddInternalForm((p) => ({ ...p, amount: '' }));
      return;
    }
    if (addInternalSuggestedTotal != null) {
      setAddInternalForm((p) => ({ ...p, amount: String(addInternalSuggestedTotal) }));
    } else {
      setAddInternalForm((p) => ({ ...p, amount: '' }));
    }
  }, [
    showAddInternalModal,
    addInternalAmountManual,
    addInternalSuggestedTotal,
    addInternalForm.roomId,
    addInternalForm.type,
  ]);

  const rooms = useMemo(() => {
    if (roomsFromApi.length > 0) return roomsFromApi;
    if (activeTab !== 'availability') return [];
    return roomsFromBookings;
  }, [roomsFromApi, roomsFromBookings, activeTab]);

  const availabilityRoomsLoading =
    activeTab === 'availability' &&
    rooms.length === 0 &&
    (roomsPending || availBookingsPending);

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateBooking(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: (body) => createBooking(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setShowAddInternalModal(false);
      setAddInternalForm(emptyInternalBookingForm());
    },
  });

  useEffect(() => {
    if (!showAddInternalModal) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowAddInternalModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddInternalModal]);

  const guestUpdateMutation = useMutation({
    mutationFn: ({ id, body }) => updateGuestBooking(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      setGuestSelectedId(null);
    },
  });

  async function ensureRevenueTransactionForBooking(bookingLike) {
    const bookingEntity = normalizeBookingEntity(bookingLike);
    if (!bookingEntity || bookingEntity.revenueTransactionId) return;
    const bookingId = bookingEntity._id ?? bookingEntity.id;
    const amount = Number(bookingEntity.amount ?? bookingEntity.totalAmount ?? 0);
    if (!bookingId || !Number.isFinite(amount) || amount <= 0) return;
    const dateRaw = bookingEntity.checkIn || bookingEntity.eventDate || bookingEntity.createdAt || new Date().toISOString();
    const date = new Date(dateRaw).toISOString().slice(0, 10);
    const ref = referenceDisplay(bookingEntity);
    await createTransaction(
      {
        type: 'income',
        category: 'booking',
        description: `Booking confirmed: ${ref}`,
        amount,
        date,
        reference: `BOOK-${String(ref).replace(/\s+/g, '').slice(0, 16)}`,
        booking: String(bookingId),
        // As requested: Dr revenue, Cr accounts receivable.
        debitAccount: '4000',
        creditAccount: '1010',
      },
      { idempotencyKey: `booking-revenue-${String(bookingId)}` }
    );
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
  }

  function handleConfirm(id) {
    const fallbackBooking = list.find((b) => String(b._id ?? b.id) === String(id));
    updateMutation.mutate(
      { id, body: { status: 'confirmed' } },
      {
        onSuccess: async (resp) => {
          const updated = normalizeBookingEntity(resp) || fallbackBooking;
          const latest = await getBooking(id).catch(() => updated);
          await ensureRevenueTransactionForBooking(latest || updated).catch(() => {});
        },
      }
    );
  }
  function handleCheckIn(id) {
    updateMutation.mutate({ id, body: { status: 'checked-in' } });
  }
  function handleCheckOut(id) {
    updateMutation.mutate({ id, body: { status: 'checked-out' } });
  }
  function handleCancel(id) {
    if (!window.confirm('Cancel this booking?')) return;
    updateMutation.mutate({ id, body: { status: 'cancelled' } });
  }

  function handleGuestStatusChange(id, newStatus, e) {
    e?.stopPropagation?.();
    guestUpdateMutation.mutate({ id, body: { status: newStatus } });
  }

  async function handleGuestCheckAvailability() {
    if (!guestSelected || !guestSelected.checkIn || !guestSelected.checkOut) return;
    setGuestCheckingAvail(true);
    setGuestAvailResult(null);
    try {
      const checkIn =
        typeof guestSelected.checkIn === 'string' && guestSelected.checkIn.length === 10
          ? guestSelected.checkIn
          : guestSelected.checkIn && new Date(guestSelected.checkIn).toISOString
            ? new Date(guestSelected.checkIn).toISOString().slice(0, 10)
            : guestSelected.checkIn;
      const checkOut =
        typeof guestSelected.checkOut === 'string' && guestSelected.checkOut.length === 10
          ? guestSelected.checkOut
          : guestSelected.checkOut && new Date(guestSelected.checkOut).toISOString
            ? new Date(guestSelected.checkOut).toISOString().slice(0, 10)
            : guestSelected.checkOut;
      const res = await getRooms({ checkIn, checkOut });
      const payload = res?.data !== undefined ? res.data : res;
      setGuestAvailResult(Array.isArray(payload) ? { rooms: payload } : payload);
    } catch (err) {
      setGuestAvailResult({ error: err?.message || 'Could not check availability' });
    } finally {
      setGuestCheckingAvail(false);
    }
  }

  function handleGuestConfirm() {
    if (!guestSelected) return;
    const snapshot = { ...guestSelected };
    guestUpdateMutation.mutate(
      { id: guestSelected._id, body: { status: 'confirmed' } },
      {
        onSuccess: async () => {
          await ensureRevenueTransactionForBooking(snapshot).catch(() => {});
        },
      }
    );
  }
  function handleGuestReject() {
    if (!guestSelected) return;
    guestUpdateMutation.mutate({ id: guestSelected._id, body: { status: 'cancelled' } });
  }
  function handleGuestWaitlist() {
    if (!guestSelected) return;
    guestUpdateMutation.mutate({ id: guestSelected._id, body: { status: 'waitlist' } });
  }

  function submitAddInternal(e) {
    e.preventDefault();
    const f = addInternalForm;
    if (!f.guestName.trim() || !f.guestEmail.trim() || !f.guestPhone.trim()) {
      window.alert('Please enter guest name, email, and phone.');
      return;
    }
    if (!f.checkIn || !f.checkOut) {
      window.alert('Please select check-in and check-out dates.');
      return;
    }
    const body = {
      guestName: f.guestName.trim(),
      guestEmail: f.guestEmail.trim(),
      guestPhone: f.guestPhone.trim(),
      type: f.type,
      checkIn: f.checkIn,
      checkOut: f.checkOut,
      status: 'pending',
    };
    if (f.roomId) {
      body.roomId = f.roomId;
      if (addInternalSelectedRoom) {
        body.roomName = String(
          addInternalSelectedRoom.name || addInternalSelectedRoom.number || addInternalSelectedRoom.title || f.roomId
        ).trim();
      }
    }
    if (f.amount !== '' && f.amount != null && !Number.isNaN(Number(f.amount))) body.amount = Number(f.amount);
    if (f.deposit !== '' && f.deposit != null && !Number.isNaN(Number(f.deposit))) body.deposit = Number(f.deposit);
    if (f.notes.trim()) body.notes = f.notes.trim();
    createBookingMutation.mutate(body);
  }

  /** Build grid days as local calendar dates (no UTC shift). */
  const availDays = useMemo(() => {
    const y = availStart.getFullYear();
    const m = availStart.getMonth();
    const d = availStart.getDate();
    const out = [];
    for (let i = 0; i < DAYS_IN_VIEW; i++) {
      out.push(new Date(y, m, d + i));
    }
    return out;
  }, [availStart]);

  const { keys: bookedKeys, byKey: bookedByKey } = useMemo(() => {
    if (availDays.length === 0) return { keys: new Set(), byKey: new Map() };
    const start = availDays[0];
    const end = availDays[availDays.length - 1];
    return getOccupiedRoomDayKeys(allBookingsForAvail, start, end);
  }, [allBookingsForAvail, availDays]);

  /** Today as local date string for column highlighting. */
  const todayDateString = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate()).toDateString();
  }, []);

  return (
    <div className="bookings-page">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title bookings-page-heading">
            {activeTab === 'list' && 'Internal'}
            {activeTab === 'guest' && 'Website'}
            {activeTab === 'availability' && 'Availability'}
          </div>
          <div className="page-subtitle">
            {activeTab === 'list' && (
              <>
                {totalCount} row{totalCount !== 1 ? 's' : ''} · confirm, check-in, check-out
                {!isAdmin && (
                  <span className="bookings-admin-only-hint"> · New entries: administrators only.</span>
                )}
              </>
            )}
            {activeTab === 'guest' && (
              <>{guestTotalCount} request{guestTotalCount !== 1 ? 's' : ''} · tracking codes and status</>
            )}
            {activeTab === 'availability' && (
              <>By room and date · room name opens month view</>
            )}
          </div>
        </div>
        {activeTab === 'list' && isAdmin && (
          <div className="page-header-right">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                createBookingMutation.reset();
                setAddInternalAmountManual(false);
                setAddInternalForm(emptyInternalBookingForm());
                setShowAddInternalModal(true);
              }}
            >
              <i className="fas fa-plus" /> Add internal booking
            </button>
          </div>
        )}
      </div>

      <div className="page-tabs page-tabs--bookings">
        <button type="button" className={`page-tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setBookingsTab('list')}>
          Internal
        </button>
        <button type="button" className={`page-tab ${activeTab === 'guest' ? 'active' : ''}`} onClick={() => setBookingsTab('guest')}>
          Website requests
        </button>
        <button type="button" className={`page-tab ${activeTab === 'availability' ? 'active' : ''}`} onClick={() => setBookingsTab('availability')}>
          Room availability
        </button>
      </div>

      {activeTab === 'list' && error && (
        <div className="card card--error">
          <div className="card-body">{error.message}</div>
        </div>
      )}
      {activeTab === 'list' && updateMutation.isError && (
        <div className="card card--error">
          <div className="card-body" style={{ whiteSpace: 'pre-line' }}>
            {formatBookingMutationMessage(updateMutation.error, 'Could not update booking status.')}
          </div>
        </div>
      )}
      {activeTab === 'guest' && guestError && (
        <div className="card card--error">
          <div className="card-body">{guestError.message}</div>
        </div>
      )}
      {activeTab === 'guest' && guestUpdateMutation.isError && (
        <div className="card card--error">
          <div className="card-body" style={{ whiteSpace: 'pre-line' }}>
            {formatBookingMutationMessage(guestUpdateMutation.error, 'Could not update guest booking status.')}
          </div>
        </div>
      )}

      {activeTab === 'list' && (
        <div className="bookings-layout">
          <div className="bookings-main">
            <div className="bookings-filters-bar">
              <input
                type="search"
                className="form-control"
                placeholder="Search by guest name, reference, or room…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ maxWidth: 280 }}
              />
              <select className="form-control" value={statusFilter} onChange={(e) => { const v = e.target.value; setStatusFilter(v); setStatusSidebar(v); }} style={{ minWidth: 120 }}>
                {STATUS_FILTERS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select className="form-control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ minWidth: 100 }}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="bookings-sidebar-filters">
              {STATUS_FILTERS.filter((f) => f.value).map((f) => (
                <button
                  type="button"
                  key={f.value}
                  className={`btn btn-ghost btn-sm ${statusSidebar === f.value ? 'active' : ''}`}
                  onClick={() => {
                    setStatusSidebar((s) => (s === f.value ? '' : f.value));
                    setStatusFilter((prev) => (prev === f.value ? '' : f.value));
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="card">
              <div className="card-body card-body--no-pad">
                <div className="statement-table-wrap">
                  <table className="statement-table">
                    <thead>
                      <tr>
                        <th>Guest</th>
                        <th>Room</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th className="statement-table-num">Total</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading && (
                        <tr>
                          <td colSpan={7}>Loading…</td>
                        </tr>
                      )}
                      {!isLoading && list.length === 0 && (
                        <tr>
                          <td colSpan={7}>No bookings</td>
                        </tr>
                      )}
                      {!isLoading &&
                        list.map((b) => (
                          <tr
                            key={b._id}
                            className={selectedId === b._id ? 'selected' : ''}
                            onClick={() => setSelectedId(b._id)}
                          >
                            <td>
                              <div>{b.guestName || '—'}</div>
                              {b.guestEmail && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.guestEmail}</div>}
                            </td>
                            <td>{roomDisplay(b)}</td>
                            <td>{fmtDate(b.checkIn)}</td>
                            <td>{fmtDate(b.checkOut)}</td>
                            <td className="statement-table-num">R {fmtNum(b.amount ?? b.totalAmount)}</td>
                            <td>
                              <span className={`badge ${statusBadge(b.status)}`}>{statusStr(b.status) || 'pending'}</span>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {statusStr(b.status).toLowerCase() === 'pending' && (
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleConfirm(b._id)} disabled={updateMutation.isPending}>
                                  Confirm
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {(meta.total || 0) > LIMIT && (
                  <div className="pagination-bar">
                    <span className="pagination-info">
                      Page {meta.page ?? page} of {Math.ceil((meta.total || 0) / LIMIT)}
                    </span>
                    <div className="pagination-btns">
                      <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Prev
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" disabled={page >= Math.ceil((meta.total || 0) / LIMIT)} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bookings-detail-panel">
            {!selectedId && <div className="bookings-detail-empty">Click a row to view booking details</div>}
            {selectedId && (loadingDetail && !booking ? <div className="bookings-detail-loading">Loading…</div> : booking && (
              <div className="bookings-detail-content">
                <div className="bookings-detail-header">
                  <h3>Booking — {referenceDisplay(booking)}</h3>
                  <span className={`badge ${statusBadge(booking.status)}`}>{statusStr(booking.status) || 'pending'}</span>
                </div>
                <div className="review-block">
                  <div className="review-block-header">Booking</div>
                  <div className="review-row"><div className="rv-label">Room</div><div className="rv-val">{roomDisplay(booking)}</div></div>
                  <div className="review-row"><div className="rv-label">Check-in</div><div className="rv-val">{fmtDate(booking.checkIn)}</div></div>
                  <div className="review-row"><div className="rv-label">Check-out</div><div className="rv-val">{fmtDate(booking.checkOut)}</div></div>
                  <div className="review-row"><div className="rv-label">Nights</div><div className="rv-val">{booking.nights ?? (booking.checkIn && booking.checkOut ? Math.max(0, Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / 86400000)) : '—')}</div></div>
                  <div className="review-row"><div className="rv-label">Rate</div><div className="rv-val">R {fmtNum(booking.rate ?? booking.amount)}</div></div>
                  <div className="review-row"><div className="rv-label">Deposit</div><div className="rv-val">R {fmtNum(booking.deposit)}</div></div>
                  <div className="review-row"><div className="rv-label">Total</div><div className="rv-val">R {fmtNum(booking.amount ?? booking.totalAmount)}</div></div>
                  <div className="review-row"><div className="rv-label">Debtor</div><div className="rv-val">{booking.debtorId || '—'}</div></div>
                  <div className="review-row"><div className="rv-label">Revenue txn</div><div className="rv-val">{booking.revenueTransactionId || '—'}</div></div>
                </div>
                <div className="review-block">
                  <div className="review-block-header">Guest contact</div>
                  <div className="review-row"><div className="rv-label">Name</div><div className="rv-val">{booking.guestName || '—'}</div></div>
                  <div className="review-row"><div className="rv-label">Email</div><div className="rv-val">{booking.guestEmail || '—'}</div></div>
                  <div className="review-row"><div className="rv-label">Phone</div><div className="rv-val">{booking.guestPhone || '—'}</div></div>
                </div>
                <div className="bookings-detail-actions">
                  {statusStr(booking.status).toLowerCase() === 'pending' && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleConfirm(booking._id)} disabled={updateMutation.isPending}>Confirm booking</button>
                  )}
                  {statusStr(booking.status).toLowerCase() === 'confirmed' && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleCheckIn(booking._id)} disabled={updateMutation.isPending}>Check in guest</button>
                  )}
                  {statusStr(booking.status).toLowerCase() === 'checked-in' && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleCheckOut(booking._id)} disabled={updateMutation.isPending}>Check out guest</button>
                  )}
                  {['pending', 'confirmed'].includes(statusStr(booking.status).toLowerCase()) && (
                    <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => handleCancel(booking._id)} disabled={updateMutation.isPending}>Cancel booking</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'guest' && (
        <div className="bookings-layout">
          <div className="bookings-main">
            <div className="bookings-filters-bar">
              <input
                type="search"
                className="form-control"
                placeholder="Search by guest name, tracking code, or room…"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                style={{ maxWidth: 280 }}
              />
              <select
                className="form-control"
                value={guestStatusFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setGuestStatusFilter(v);
                  setGuestStatusSidebar(v);
                }}
                style={{ minWidth: 120 }}
              >
                {GUEST_STATUS_FILTERS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="bookings-sidebar-filters">
              {GUEST_STATUS_FILTERS.filter((f) => f.value).map((f) => (
                <button
                  type="button"
                  key={f.value}
                  className={`btn btn-ghost btn-sm ${guestStatusSidebar === f.value ? 'active' : ''}`}
                  onClick={() => {
                    setGuestStatusSidebar((s) => (s === f.value ? '' : f.value));
                    setGuestStatusFilter((prev) => (prev === f.value ? '' : f.value));
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="card">
              <div className="card-body card-body--no-pad">
                <div className="statement-table-wrap">
                  <table className="statement-table">
                    <thead>
                      <tr>
                        <th>Tracking code</th>
                        <th>Guest</th>
                        <th>Room</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th className="statement-table-num">Total</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {guestLoading && (
                        <tr>
                          <td colSpan={8}>Loading…</td>
                        </tr>
                      )}
                      {!guestLoading && guestList.length === 0 && (
                        <tr>
                          <td colSpan={8}>No requests</td>
                        </tr>
                      )}
                      {!guestLoading &&
                        guestList.map((b) => (
                          <tr
                            key={b._id}
                            className={guestSelectedId === b._id ? 'selected' : ''}
                            onClick={() => {
                              setGuestSelectedId(b._id);
                              setGuestAvailResult(null);
                            }}
                          >
                            <td><strong>{b.trackingCode || '—'}</strong></td>
                            <td>
                              <div>{b.guestName || '—'}</div>
                              {b.guestEmail && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.guestEmail}</div>}
                            </td>
                            <td>{fmtRoomGuest(b.room || b.roomId)}</td>
                            <td>{fmtDate(b.checkIn)}</td>
                            <td>{fmtDate(b.checkOut)}</td>
                            <td className="statement-table-num">R {Number(b.totalAmount || 0).toLocaleString('en-ZA')}</td>
                            <td className="guest-booking-status-cell">
                              <select
                                className={`guest-booking-status-select ${guestStatusBadgeClass(b.status)}`}
                                value={GUEST_STATUS_OPTIONS.includes(statusStr(b.status)) ? statusStr(b.status) : 'pending'}
                                onChange={(e) => handleGuestStatusChange(b._id, e.target.value, e)}
                                onClick={(e) => e.stopPropagation()}
                                disabled={guestUpdateMutation.isPending}
                              >
                                {GUEST_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {statusStr(b.status).toLowerCase() === 'pending' && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() =>
                                    guestUpdateMutation.mutate(
                                      { id: b._id, body: { status: 'confirmed' } },
                                      {
                                        onSuccess: async () => {
                                          await ensureRevenueTransactionForBooking(b).catch(() => {});
                                        },
                                      }
                                    )
                                  }
                                  disabled={guestUpdateMutation.isPending}
                                >
                                  Confirm
                                </button>
                              )}
                              {statusStr(b.status).toLowerCase() === 'confirmed' && (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                                  onClick={() => handleGuestStatusChange(b._id, 'cancelled', null)}
                                  disabled={guestUpdateMutation.isPending}
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {(guestMeta.total || 0) > LIMIT && (
                  <div className="pagination-bar">
                    <span className="pagination-info">
                      Page {guestMeta.page ?? guestPage} of {Math.ceil((guestMeta.total || 0) / LIMIT)}
                    </span>
                    <div className="pagination-btns">
                      <button type="button" className="btn btn-outline btn-sm" disabled={guestPage <= 1} onClick={() => setGuestPage((p) => p - 1)}>
                        Prev
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={guestPage >= Math.ceil((guestMeta.total || 0) / LIMIT)}
                        onClick={() => setGuestPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bookings-detail-panel">
            {!guestSelectedId && <div className="bookings-detail-empty">Click a row to view request details</div>}
            {guestSelectedId && guestSelected && (
              <div className="bookings-detail-content">
                <div className="bookings-detail-header">
                  <h3>{guestSelected.trackingCode || guestSelected._id}</h3>
                  <span className={`guest-status-pill ${guestStatusBadgeClass(guestSelected.status)}`}>{statusStr(guestSelected.status) || 'pending'}</span>
                </div>
                <div className="review-block">
                  <div className="review-block-header">Guest</div>
                  <div className="review-row"><div className="rv-label">Name</div><div className="rv-val">{guestSelected.guestName || '—'}</div></div>
                  <div className="review-row"><div className="rv-label">Email</div><div className="rv-val">{guestSelected.guestEmail || '—'}</div></div>
                  <div className="review-row"><div className="rv-label">Phone</div><div className="rv-val">{guestSelected.guestPhone || '—'}</div></div>
                </div>
                <div className="review-block">
                  <div className="review-block-header">Dates & amount</div>
                  <div className="review-row"><div className="rv-label">Check-in</div><div className="rv-val">{fmtDate(guestSelected.checkIn)}</div></div>
                  <div className="review-row"><div className="rv-label">Check-out</div><div className="rv-val">{fmtDate(guestSelected.checkOut)}</div></div>
                  <div className="review-row"><div className="rv-label">Room</div><div className="rv-val">{fmtRoomGuest(guestSelected.room || guestSelected.roomId)}</div></div>
                  <div className="review-row"><div className="rv-label">Total</div><div className="rv-val">R {Number(guestSelected.totalAmount || 0).toLocaleString('en-ZA')}</div></div>
                  <div className="review-row"><div className="rv-label">Debtor</div><div className="rv-val">{guestSelected.debtorId || '—'}</div></div>
                  <div className="review-row"><div className="rv-label">Revenue txn</div><div className="rv-val">{guestSelected.revenueTransactionId || '—'}</div></div>
                  {guestSelected.notes && (
                    <div className="review-row"><div className="rv-label">Notes</div><div className="rv-val">{guestSelected.notes}</div></div>
                  )}
                </div>

                <div className="guest-booking-availability">
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleGuestCheckAvailability} disabled={guestCheckingAvail}>
                    {guestCheckingAvail ? <><i className="fas fa-spinner fa-spin" /> Checking…</> : <><i className="fas fa-calendar-check" /> Check availability</>}
                  </button>
                  {guestAvailResult && (
                    <div className={`guest-booking-availability-result ${guestAvailResult.error ? 'is-error' : ''}`}>
                      {guestAvailResult.error ? (
                        <span>{guestAvailResult.error}</span>
                      ) : Array.isArray(guestAvailResult.rooms) && guestAvailResult.rooms.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                          {guestAvailResult.rooms.map((r) => (
                            <li key={r._id ?? r.id ?? r.name}>
                              {fmtRoomGuest(r)} —{' '}
                              {r.availableForDates !== false ? (
                                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>Available</span>
                              ) : (
                                <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                                  Booked
                                  {r.bookedBy?.length > 0 ? ` (by ${r.bookedBy.map((x) => x.guestName || 'Guest').join(', ')})` : ''}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : guestAvailResult.available === true ? (
                        <span><i className="fas fa-check-circle" style={{ marginRight: 6 }} />Available for these dates.</span>
                      ) : guestAvailResult.available === false ? (
                        <span><i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} />Not available.</span>
                      ) : (
                        <span><i className="fas fa-check-circle" style={{ marginRight: 6 }} />Availability checked.</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="bookings-detail-actions">
                  {statusStr(guestSelected.status).toLowerCase() === 'confirmed' ? (
                    <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={handleGuestReject} disabled={guestUpdateMutation.isPending}>Cancel booking</button>
                  ) : statusStr(guestSelected.status).toLowerCase() !== 'cancelled' && (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={handleGuestConfirm} disabled={guestUpdateMutation.isPending}>Confirm</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={handleGuestWaitlist} disabled={guestUpdateMutation.isPending}>Waitlist</button>
                      <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={handleGuestReject} disabled={guestUpdateMutation.isPending}>Reject</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'availability' && (
        <div className="availability-tab">
          <div className="availability-card card availability-card--rooms-ref">
            <div className="availability-card-header">
              <h3 className="availability-title">Room availability</h3>
              <p className="availability-subtitle">
                Guest bookings by room and date (check-in → check-out).{' '}
                <span className="availability-subtitle-hint">
                  <i className="fas fa-calendar-alt" aria-hidden /> Click a room name for a full-month booking calendar.
                </span>
              </p>
            </div>
            <div className="availability-nav">
              <button
                type="button"
                className="btn btn-outline btn-sm availability-nav-btn"
                onClick={() => setAvailStart((d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - DAYS_IN_VIEW); return x; })}
                aria-label="Previous period"
              >
                <i className="fas fa-chevron-left" /> Prev
              </button>
              <span className="availability-nav-label">
                {fmtDate(availDays[0])} – {fmtDate(availDays[availDays.length - 1])}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm availability-today-btn"
                onClick={() => setAvailStart(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm availability-nav-btn"
                onClick={() => setAvailStart((d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + DAYS_IN_VIEW); return x; })}
                aria-label="Next period"
              >
                Next <i className="fas fa-chevron-right" />
              </button>
            </div>
            <div className="availability-legend">
              <span className="availability-legend-item"><span className="availability-dot available" /> Available</span>
              <span className="availability-legend-item"><span className="availability-dot booked" /> Booked</span>
              <span className="availability-today-badge">Today</span>
            </div>
            <div className="availability-grid-wrap">
              <table className="availability-grid">
                <thead>
                  <tr>
                    <th className="availability-room-col">Room</th>
                    {availDays.map((d) => {
                      const isToday = d.toDateString() === todayDateString;
                      return (
                        <th key={d.toISOString()} className={`availability-day-col ${isToday ? 'today' : ''}`}>
                          <span className="availability-day-weekday">{d.toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
                          <span className="availability-day-num">{d.getDate()}</span>
                          <span className="availability-day-month">{d.toLocaleDateString('en-ZA', { month: 'short' })}</span>
                          {isToday && <span className="availability-day-today">Today</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {availabilityRoomsLoading && (
                    <tr>
                      <td colSpan={availDays.length + 1} className="availability-empty">
                        <i className="fas fa-spinner fa-spin" aria-hidden /> Loading rooms and bookings…
                      </td>
                    </tr>
                  )}
                  {!availabilityRoomsLoading && roomsIsError && rooms.length === 0 && (
                    <tr>
                      <td colSpan={availDays.length + 1} className="availability-empty availability-empty--warning">
                        <span>Could not load rooms from the server{roomsErr?.message ? `: ${roomsErr.message}` : ''}.</span>
                        <span className="availability-empty-sub"> Check your connection and API, or add rooms under Rooms.</span>
                      </td>
                    </tr>
                  )}
                  {!availabilityRoomsLoading && !roomsIsError && rooms.length === 0 && (
                    <tr>
                      <td colSpan={availDays.length + 1} className="availability-empty">
                        No rooms found. Add rooms under <strong>Rooms</strong>, or create a guest booking with a room assigned.
                      </td>
                    </tr>
                  )}
                  {!availabilityRoomsLoading && rooms.map((room) => {
                    const roomId = room._id ?? room.id;
                    const name = room.name ?? room.number ?? roomId;
                    return (
                      <tr key={roomId} className="availability-room-row">
                        <td className="availability-room-col">
                          <button
                            type="button"
                            className="availability-room-cal-btn"
                            onClick={() => setAvailCalendarRoom({ id: roomId, name })}
                            title={`Open booking calendar — ${name}`}
                            aria-label={`Open booking calendar for ${name}`}
                          >
                            <span className="availability-room-name">{name}</span>
                            <i className="fas fa-calendar-alt availability-room-cal-icon" aria-hidden />
                          </button>
                        </td>
                        {availDays.map((d) => {
                          const key = `${roomId}-${d.toDateString()}`;
                          const booked = bookedKeys.has(key);
                          const guests = bookedByKey.get(key) || [];
                          const isToday = d.toDateString() === todayDateString;
                          const tooltip = booked
                            ? `${name} · ${d.toLocaleDateString('en-ZA')} · Booked${guests.length ? ` by ${guests.map((g) => g.guestName).join(', ')}` : ''}`
                            : `${name} · ${d.toLocaleDateString('en-ZA')} · Available`;
                          return (
                            <td
                              key={key}
                              className={`availability-cell ${booked ? 'booked' : 'available'} ${isToday ? 'today' : ''}`}
                              title={tooltip}
                            >
                              <span className="availability-cell-inner">
                                {booked ? <i className="fas fa-bed availability-cell-icon" /> : <i className="fas fa-check availability-cell-icon available" />}
                                <span className="availability-cell-label">{booked ? 'Booked' : 'Free'}</span>
                                {booked && guests.length > 0 && (
                                  <span className="availability-cell-guest">{guests.map((g) => g.guestName).join(', ')}</span>
                                )}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="availability-footer">Based on guest bookings. Dates in local time. Click Prev/Next to change period; Today resets to current week.</p>
          </div>
        </div>
      )}

      {showAddInternalModal && isAdmin && (
        <div
          className="rooms-events-modal-overlay"
          onClick={() => setShowAddInternalModal(false)}
          role="presentation"
        >
          <div
            className="rooms-events-modal bookings-add-internal-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookings-add-internal-title"
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="bookings-add-internal-title" className="rooms-events-modal-title">
                  New reservation
                </h2>
                <p className="rooms-events-modal-sub">Staff entry · starts as pending until you confirm.</p>
              </div>
              <button
                type="button"
                className="rooms-events-modal-close"
                onClick={() => setShowAddInternalModal(false)}
                aria-label="Close"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              {createBookingMutation.isError && (
                <div className="card card--error" style={{ marginBottom: 12 }}>
                  <div className="card-body" style={{ fontSize: 12 }}>
                    {createBookingMutation.error?.message || 'Could not create booking.'}
                  </div>
                </div>
              )}
              <form className="bookings-add-internal-form" onSubmit={submitAddInternal}>
                <div className="bookings-add-internal-grid">
                  <label className="bookings-add-field">
                    <span>Guest name *</span>
                    <input
                      className="form-control"
                      value={addInternalForm.guestName}
                      onChange={(e) => setAddInternalForm((p) => ({ ...p, guestName: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="bookings-add-field">
                    <span>Email *</span>
                    <input
                      type="email"
                      className="form-control"
                      value={addInternalForm.guestEmail}
                      onChange={(e) => setAddInternalForm((p) => ({ ...p, guestEmail: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="bookings-add-field">
                    <span>Phone *</span>
                    <input
                      className="form-control"
                      value={addInternalForm.guestPhone}
                      onChange={(e) => setAddInternalForm((p) => ({ ...p, guestPhone: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="bookings-add-field">
                    <span>Type</span>
                    <select
                      className="form-control"
                      value={addInternalForm.type}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAddInternalAmountManual(false);
                        setAddInternalForm((p) => ({
                          ...p,
                          type: v,
                          ...(v === 'event' ? { roomId: '' } : {}),
                        }));
                      }}
                    >
                      <option value="bnb">BnB</option>
                      <option value="event">Event</option>
                    </select>
                  </label>
                  <label className="bookings-add-field bookings-add-field--wide">
                    <span>Room (BnB)</span>
                    <select
                      className="form-control"
                      value={addInternalForm.roomId}
                      onChange={(e) => {
                        setAddInternalAmountManual(false);
                        setAddInternalForm((p) => ({ ...p, roomId: e.target.value }));
                      }}
                    >
                      <option value="">— Select for rate & total —</option>
                      {roomsFromApi.map((r) => {
                        const id = r._id ?? r.id;
                        const rate = roomNightlyRate(r);
                        const label = r.name || r.number || id;
                        return (
                          <option key={id} value={id}>
                            {label}
                            {rate > 0 ? ` · R ${rate.toLocaleString('en-ZA')}/night` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {addInternalForm.type === 'bnb' && addInternalSelectedRoom && (
                    <div className="bookings-add-pricing-hint bookings-add-field--wide">
                      {addInternalNightlyRate > 0 ? (
                        <span>
                          Rate <strong>R {addInternalNightlyRate.toLocaleString('en-ZA')}</strong>/night from room listing
                          {addInternalNights > 0 && (
                            <>
                              {' '}
                              · <strong>{addInternalNights}</strong> night{addInternalNights !== 1 ? 's' : ''}
                              {addInternalSuggestedTotal != null && (
                                <> → suggested total <strong>R {addInternalSuggestedTotal.toLocaleString('en-ZA')}</strong></>
                              )}
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="bookings-add-pricing-warn">No nightly rate on this room — enter total manually.</span>
                      )}
                    </div>
                  )}
                  <label className="bookings-add-field">
                    <span>Check-in *</span>
                    <input
                      type="date"
                      className="form-control"
                      value={addInternalForm.checkIn}
                      onChange={(e) => {
                        setAddInternalAmountManual(false);
                        setAddInternalForm((p) => ({ ...p, checkIn: e.target.value }));
                      }}
                      required
                    />
                  </label>
                  <label className="bookings-add-field">
                    <span>Check-out *</span>
                    <input
                      type="date"
                      className="form-control"
                      value={addInternalForm.checkOut}
                      min={addInternalForm.checkIn || undefined}
                      onChange={(e) => {
                        setAddInternalAmountManual(false);
                        setAddInternalForm((p) => ({ ...p, checkOut: e.target.value }));
                      }}
                      required
                    />
                  </label>
                  <label className="bookings-add-field">
                    <span>Total (R)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="form-control"
                      value={addInternalForm.amount}
                      onChange={(e) => {
                        setAddInternalAmountManual(true);
                        setAddInternalForm((p) => ({ ...p, amount: e.target.value }));
                      }}
                    />
                  </label>
                  {addInternalForm.type === 'bnb' && addInternalSelectedRoom && addInternalSuggestedTotal != null && (
                    <p className="bookings-add-field bookings-add-field--wide bookings-add-total-note">
                      Total updates from nights × rate unless you edit the field above.
                    </p>
                  )}
                  <label className="bookings-add-field">
                    <span>Deposit (R)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="form-control"
                      value={addInternalForm.deposit}
                      onChange={(e) => setAddInternalForm((p) => ({ ...p, deposit: e.target.value }))}
                    />
                  </label>
                  <label className="bookings-add-field bookings-add-field--wide">
                    <span>Notes</span>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={addInternalForm.notes}
                      onChange={(e) => setAddInternalForm((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="bookings-add-internal-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setShowAddInternalModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={createBookingMutation.isPending}>
                    {createBookingMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check" /> Create booking
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {availCalendarRoom && (
        <RoomBookingCalendarModal
          roomId={availCalendarRoom.id}
          roomTitle={availCalendarRoom.name}
          guestBookingsList={allBookingsForAvail}
          onClose={closeAvailCalendar}
        />
      )}
    </div>
  );
}
