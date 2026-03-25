/** Guest-facing / staff reference for a booking row (list or detail). */
export function bookingReferenceDisplay(b) {
  if (!b || typeof b !== 'object') return '—';
  if (b.reference != null) return String(b.reference);
  if (b.bookingReference != null) return String(b.bookingReference);
  const id = b._id ?? b.id;
  if (id != null) return typeof id === 'string' ? id.slice(-8) : String(id).slice(-8);
  return '—';
}

export function normalizeBookingRecord(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.booking && typeof data.booking === 'object') return data.booking;
  if (data.data && typeof data.data === 'object') return data.data;
  return data;
}

export function bookingTotalAmount(b) {
  const n = Number(b?.amount ?? b?.totalAmount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function bookingGuestLabel(b) {
  return String(b?.guestName || '').trim() || '—';
}
