/**
 * User-facing messages for guest booking flows — avoid raw browser/axios noise in UI.
 * @param {Error & { response?: { data?: unknown } }} err
 * @returns {string}
 */
export function formatGuestBookingError(err) {
  const data = err?.response?.data;
  if (data && typeof data === 'object') {
    const errors = /** @type {{ errors?: unknown }} */ (data).errors;
    if (Array.isArray(errors)) {
      const lines = errors
        .map((e) => {
          if (e == null) return '';
          if (typeof e === 'string') return e;
          if (typeof e === 'object' && ('message' in e || 'msg' in e)) {
            return String(/** @type {{ message?: string; msg?: string }} */ (e).message ?? e.msg ?? '');
          }
          return '';
        })
        .filter(Boolean);
      if (lines.length) return lines.join('\n');
    }
    const msg = /** @type {{ message?: string }} */ (data).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  const raw = err?.message || '';
  if (!raw) return 'Something went wrong. Please try again or contact us.';
  if (/network error/i.test(raw) || /** @type {{ code?: string }} */ (err).code === 'ERR_NETWORK') {
    return 'We could not reach the server. Check your connection and try again.';
  }
  if (/localhost|127\.0\.0\.1|:\d{4,5}\//i.test(raw) || /^https?:\/\//i.test(raw.trim())) {
    return 'Something went wrong. Please try again or contact us.';
  }
  return raw;
}

/**
 * Nightly rate from API room object (field names vary by backend).
 * @param {Record<string, unknown>} r
 * @param {{ price?: number } | undefined} staticMatch
 */
export function pickRoomNightlyRate(r, staticMatch) {
  const candidates = [
    r.pricePerNight,
    r.nightlyRate,
    r.ratePerNight,
    r.rate,
    r.price,
    r.baseRate,
    staticMatch?.price,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
