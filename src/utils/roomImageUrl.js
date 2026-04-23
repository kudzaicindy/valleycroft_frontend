/**
 * Room image strings may be stored as `s3://valleycroft/public/...` (DB / API).
 * Browsers need `http(s)` URLs — this resolves them for img src / CSS url().
 *
 * Optional: set `VITE_S3_PUBLIC_HTTP_BASE` to your CloudFront or static origin
 * (no trailing slash), e.g. https://dxxxx.cloudfront.net
 * If unset, uses `https://valleycroft.s3.amazonaws.com/<key>` (path-style encoding).
 */

const DEFAULT_S3_BASE = 'https://valleycroft.s3.eu-north-1.amazonaws.com';

function encodeKeySegments(key) {
  return String(key)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function normalizeEncodedUri(value) {
  const s = String(value || '');
  try {
    return encodeURI(decodeURI(s));
  } catch {
    return encodeURI(s);
  }
}

/**
 * @param {string | null | undefined} src
 * @returns {string}
 */
export function resolveRoomImageUrl(src) {
  if (src == null || src === '') return '';
  const s = String(src).trim();
  if (/^https?:\/\//i.test(s)) return normalizeEncodedUri(s);
  if (/^data:/i.test(s)) return s;
  const configuredS3Base =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_S3_PUBLIC_HTTP_BASE
      ? String(import.meta.env.VITE_S3_PUBLIC_HTTP_BASE).trim().replace(/\/$/, '')
      : '';
  const s3Base = configuredS3Base || DEFAULT_S3_BASE;
  /** Root-relative paths may contain spaces; encodeURI keeps `/` and fixes CSS url() parsing. */
  if (s.startsWith('/')) {
    if (s.startsWith('/rooms/') || s.startsWith('/public/') || s.startsWith('/uploads/')) {
      return `${s3Base}${normalizeEncodedUri(s)}`;
    }
    // Legacy room image keys often come as "/house ...jpg"; in S3 these live under /public/.
    return `${s3Base}/public${normalizeEncodedUri(s)}`;
  }

  const m = /^s3:\/\/([^/]+)\/(.+)$/i.exec(s);
  if (m) {
    const bucket = m[1];
    const key = m[2];
    if (configuredS3Base) {
      return `${configuredS3Base}/${encodeKeySegments(key)}`;
    }
    return `https://${bucket}.s3.eu-north-1.amazonaws.com/${encodeKeySegments(key)}`;
  }
  // Any other key-like value is treated as an S3 object key.
  return `${s3Base}/${encodeKeySegments(s.replace(/^\/+/, ''))}`;
}

/**
 * @param {unknown} list
 * @returns {string[]}
 */
export function resolveRoomImageUrls(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => resolveRoomImageUrl(typeof x === 'string' ? x : x?.url || x?.path || x?.src || '')).filter(Boolean);
}
