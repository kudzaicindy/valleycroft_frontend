/**
 * Canonical nightly rate from the rooms catalog (`pricePerNight` on GET /api/rooms).
 * Do not use generic `price` or static marketing defaults — those caused wrong booking totals.
 */

/**
 * @param {Record<string, unknown> | null | undefined} room
 * @returns {number}
 */
export function roomPricePerNight(room) {
  if (!room || typeof room !== 'object') return 0;
  const fields = [room.pricePerNight, room.nightlyRate, room.ratePerNight];
  for (const raw of fields) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** @param {number} rate */
export function formatRoomNightlyRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return 'Price on request';
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Landing / card label from a rooms API row. */
export function landingPriceLabelFromApi(room) {
  const rate = roomPricePerNight(room);
  if (rate <= 0) return 'See booking';
  return formatRoomNightlyRate(rate);
}

/**
 * @param {Record<string, unknown> | null | undefined} room
 * @param {number} nights
 */
export function roomStaySubtotal(room, nights = 1) {
  const nightly = roomPricePerNight(room);
  const n = Math.max(1, Number(nights) || 1);
  return nightly > 0 ? nightly * n : 0;
}
