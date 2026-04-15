/**
 * Shared availability logic — matches backend (GuestBooking, date overlap).
 * Use for: room availability tab, next-booking display, and any client-side checks.
 *
 * Dates are parsed as LOCAL (YYYY-MM-DD = that calendar day in local timezone)
 * so the grid and "who booked" stay correct regardless of server timezone.
 *
 * Occupied days: checkIn (inclusive) to checkOut (exclusive), i.e. 21–23 = 21 & 22.
 */

/**
 * Parse to a calendar day in local time. Exported for use in Rooms page etc.
 * - String "YYYY-MM-DD" (or ISO with date part) → that day at local midnight.
 * - Date (e.g. from API as UTC midnight) → use the UTC calendar date as the intended day, return local midnight for that day (so 21–23 stays 21–23 in all timezones).
 */
export function parseLocalDate(strOrDate) {
  if (strOrDate instanceof Date) {
    if (isNaN(strOrDate.getTime())) return null;
    return new Date(strOrDate.getUTCFullYear(), strOrDate.getUTCMonth(), strOrDate.getUTCDate());
  }
  if (!strOrDate || typeof strOrDate !== 'string') return null;
  const part = strOrDate.trim().slice(0, 10);
  if (part.length < 10) return null;
  const [y, m, d] = part.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Normalize to calendar day (local). Uses parseLocalDate for both string and Date from API. */
function toDate(val) {
  if (val instanceof Date) return parseLocalDate(val);
  if (typeof val === 'string' && val.length >= 10) return parseLocalDate(val);
  return null;
}

/** Return YYYY-MM-DD for a Date (local). */
export function toLocalDateString(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get roomId from a booking (guest or internal).
 */
function getBookingRoomId(b) {
  const r = b.roomId ?? b.room?._id ?? b.room;
  if (r == null) return null;
  return typeof r === 'object' ? r._id : r;
}

/**
 * A room is considered "booked" (occupied) only when the guest booking status is confirmed.
 * Pending/waitlist do not block the room.
 */
function isBookingConfirmed(b) {
  return (b.status || '').toLowerCase() === 'confirmed';
}

/**
 * Check if a room is available for the given date range using guest bookings.
 * Only confirmed bookings block the room; pending/waitlist do not.
 *
 * @param {string} roomId - Room id
 * @param {string|Date} checkIn - Range start (inclusive)
 * @param {string|Date} checkOut - Range end (exclusive, i.e. first day after stay)
 * @param {Array} guestBookings - List of guest bookings (from GET /api/guest-bookings)
 * @param {string} [excludeGuestBookingId] - If provided, ignore this booking (e.g. when editing)
 * @returns {boolean} true if no overlapping confirmed guest booking
 */
export function isRoomAvailableForDates(roomId, checkIn, checkOut, guestBookings, excludeGuestBookingId) {
  const start = toDate(checkIn);
  const end = toDate(checkOut);
  if (!start || !end || end <= start) return true;

  const list = Array.isArray(guestBookings) ? guestBookings : [];
  for (const b of list) {
    if ((b.status || '').toLowerCase() === 'cancelled') continue;
    if (!isBookingConfirmed(b)) continue;
    if (excludeGuestBookingId && (b._id === excludeGuestBookingId || b.id === excludeGuestBookingId)) continue;

    const rid = getBookingRoomId(b);
    if (rid !== roomId) continue;

    const bStart = toDate(b.checkIn);
    const bEnd = toDate(b.checkOut);
    if (!bStart || !bEnd) continue;

    if (bStart < end && bEnd > start) return false;
  }
  return true;
}

/**
 * Get the set of (roomId, date) keys that are occupied by guest bookings in the date range.
 * Occupied = checkIn (inclusive) <= day <= checkOut (inclusive). So 12–18 = 12, 13, 14, 15, 16, 17, 18.
 * All dates in local time.
 *
 * @param {Array} guestBookings - List of guest bookings
 * @param {Date} rangeStart - First day (inclusive)
 * @param {Date} rangeEnd - Last day (inclusive)
 * @returns {{ keys: Set<string>, byKey: Map<string, object[]> }} keys set and booking objects per cell (confirmed guest bookings only)
 */
export function getOccupiedRoomDayKeys(guestBookings, rangeStart, rangeEnd) {
  const keys = new Set();
  const byKey = new Map();
  const list = Array.isArray(guestBookings) ? guestBookings : [];
  const start = rangeStart instanceof Date ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()) : toDate(rangeStart);
  const end = rangeEnd instanceof Date ? new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()) : toDate(rangeEnd);
  if (!start || !end) return { keys, byKey };

  for (const b of list) {
    if ((b.status || '').toLowerCase() === 'cancelled') continue;
    if (!isBookingConfirmed(b)) continue;
    const rid = getBookingRoomId(b);
    if (rid == null) continue;

    const bStart = toDate(b.checkIn);
    const bEnd = toDate(b.checkOut);
    if (!bStart || !bEnd) continue;

    // Occupied days: day >= bStart && day <= bEnd (check-out day inclusive)
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (day <= endDay) {
      if (day >= bStart && day <= bEnd) {
        const key = `${rid}-${day.toDateString()}`;
        keys.add(key);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(b);
      }
      day.setDate(day.getDate() + 1);
    }
  }
  return { keys, byKey };
}
