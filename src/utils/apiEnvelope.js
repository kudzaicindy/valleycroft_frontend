/**
 * Unwrap common API envelopes: axios responses and { success, data, meta } bodies.
 */

export function unwrapApiBody(payload) {
  if (payload == null) return null;
  if (
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'data' in payload &&
    typeof payload.status === 'number'
  ) {
    return payload.data;
  }
  return payload;
}

/** Resolve to the array of records inside the envelope (or [] if missing). */
export function listFromSuccessEnvelope(payload) {
  const body = unwrapApiBody(payload) ?? payload;
  if (body == null) return [];
  if (Array.isArray(body)) return body;
  if (typeof body === 'object' && Array.isArray(body.data)) return body.data;
  return [];
}

export function metaFromSuccessEnvelope(payload) {
  const body = unwrapApiBody(payload) ?? payload;
  if (body == null || typeof body !== 'object') return {};
  if (body.meta && typeof body.meta === 'object') {
    return body.meta;
  }
  return {};
}
