/**
 * Room image strings may be stored as `s3://valleycroft/public/...` (DB / API).
 * Browsers need `http(s)` URLs — this resolves them for img src / CSS url().
 *
 * Optional: set `VITE_S3_PUBLIC_HTTP_BASE` to your CloudFront or static origin
 * (no trailing slash), e.g. https://dxxxx.cloudfront.net
 * If unset, uses `https://valleycroft.s3.amazonaws.com/<key>` (path-style encoding).
 */

function encodeKeySegments(key) {
  return String(key)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * @param {string | null | undefined} src
 * @returns {string}
 */
export function resolveRoomImageUrl(src) {
  if (src == null || src === '') return '';
  const s = String(src).trim();
  if (/^https?:\/\//i.test(s) || /^data:/i.test(s)) return s;
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_S3_PUBLIC_HTTP_BASE
      ? String(import.meta.env.VITE_S3_PUBLIC_HTTP_BASE).trim().replace(/\/$/, '')
      : '';
  /** Root-relative paths may contain spaces; encodeURI keeps `/` and fixes CSS url() parsing. */
  if (s.startsWith('/')) return base ? `${base}${encodeURI(s)}` : encodeURI(s);

  const m = /^s3:\/\/([^/]+)\/(.+)$/i.exec(s);
  if (m) {
    const bucket = m[1];
    const key = m[2];
    if (base) {
      return `${base}/${encodeKeySegments(key)}`;
    }
    return `https://${bucket}.s3.amazonaws.com/${encodeKeySegments(key)}`;
  }

  return s;
}

/**
 * @param {unknown} list
 * @returns {string[]}
 */
export function resolveRoomImageUrls(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => resolveRoomImageUrl(typeof x === 'string' ? x : x?.url || x?.path || x?.src || '')).filter(Boolean);
}
