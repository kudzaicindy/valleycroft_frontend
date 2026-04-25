/**
 * Shared helpers for public room lists (landing + guest booking).
 * Unwraps axios / `{ success, data }` envelopes and merges media + detail GETs.
 */

/** Unwrap axios response and/or `{ success, data: Room[] }` envelopes to a room array. */
export function unwrapRoomsListPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const d0 = payload.data;
  if (Array.isArray(d0)) return d0;
  if (d0 && typeof d0 === 'object') {
    if (Array.isArray(d0.data)) return d0.data;
    if (Array.isArray(d0.rooms)) return d0.rooms;
  }
  return [];
}

export function isLandingStayCatalogRoom(r) {
  if (!r || r.isEventSpace) return false;
  const t = String(r.type || '').toLowerCase();
  if (t.includes('venue')) return false;
  return true;
}

/**
 * Event-hire / venue rows for public enquiry pages.
 * Excludes BnB (`category` bnb/room, or stay-only catalog rows). Includes `isEventSpace`, venue-ish types, or explicit event categories.
 */
export function isPublicEventVenueRow(r) {
  if (!r) return false;
  if (r.isEventSpace === true) return true;
  const cat = String(r.category ?? r.spaceCategory ?? '').toLowerCase().trim();
  if (cat === 'bnb' || cat === 'room') return false;
  if (['event', 'venue', 'event-venue', 'events', 'function'].includes(cat)) return true;
  const t = String(r.type ?? '').toLowerCase();
  if (t.includes('venue') || t.includes('event')) return true;
  return !isLandingStayCatalogRoom(r);
}

export function normalizePublicRoomsPayload(payload) {
  return unwrapRoomsListPayload(payload).filter(isLandingStayCatalogRoom);
}

/** Same sources as landing/booking, filtered to non-BnB event spaces for marketing / enquiry pages. */
export function normalizePublicEventVenuesPayload(payload) {
  return unwrapRoomsListPayload(payload).filter(isPublicEventVenueRow);
}

/** Prefer public/media for images; merge full `GET /api/rooms` (optionally with date params) for copy, rates, availability. */
export function mergeLandingCatalogRows(mediaRows, detailRows) {
  const detailById = new Map(
    (detailRows || []).map((r) => [String(r._id ?? r.id ?? ''), r]).filter(([id]) => id)
  );
  const base = (mediaRows && mediaRows.length ? mediaRows : detailRows) || [];
  return base.map((row) => {
    const id = String(row._id ?? row.id ?? '');
    const d = id ? detailById.get(id) : null;
    if (!d) return row;
    const images = row.images?.length ? row.images : d.images || [];
    const amenities =
      Array.isArray(d.amenities) && d.amenities.length ? d.amenities : row.amenities;
    const primaryDesc =
      String(d.description || d.spaceDescription || '').trim() ||
      String(row.description || row.spaceDescription || '').trim();
    return {
      ...d,
      ...row,
      images,
      amenities,
      description: primaryDesc || d.description || row.description,
      spaceDescription: d.spaceDescription || row.spaceDescription,
      pricePerNight: d.pricePerNight != null ? d.pricePerNight : row.pricePerNight,
      capacity: d.capacity ?? row.capacity,
      bedConfig: d.bedConfig ?? d.beds ?? row.bedConfig,
      beds: d.beds ?? row.beds,
      bathroom: d.bathroom ?? row.bathroom,
      view: d.view ?? row.view,
    };
  });
}
