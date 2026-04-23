/**
 * Room image strings may be stored as `s3://valleycroft/public/...` (DB / API).
 * Browsers need `http(s)` URLs — this resolves them for img src / CSS url().
 *
 * Optional: set `VITE_S3_PUBLIC_HTTP_BASE` to your CloudFront or static origin
 * (no trailing slash), e.g. https://dxxxx.cloudfront.net
 * If unset, uses `https://valleycroft.s3.amazonaws.com/<key>` (path-style encoding).
 */

import { resolveApiBaseUrl } from '@/api/resolveApiBaseUrl';

const DEFAULT_S3_BASE = 'https://valleycroft.s3.eu-north-1.amazonaws.com';

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
  const configuredS3Base =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_S3_PUBLIC_HTTP_BASE
      ? String(import.meta.env.VITE_S3_PUBLIC_HTTP_BASE).trim().replace(/\/$/, '')
      : '';
  const s3Base = configuredS3Base || DEFAULT_S3_BASE;
  /** Root-relative paths may contain spaces; encodeURI keeps `/` and fixes CSS url() parsing. */
  if (s.startsWith('/')) {
    if (s.startsWith('/uploads/')) {
      const apiBase = resolveApiBaseUrl();
      const fallbackLocal =
        typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL_LOCAL
          ? String(import.meta.env.VITE_API_URL_LOCAL).trim().replace(/\/$/, '')
          : 'http://localhost:5000';
      const uploadsBase = (apiBase || fallbackLocal).replace(/\/$/, '');
      return `${uploadsBase}${encodeURI(s)}`;
    }
    // Room/public image keys are stored in S3 (e.g. /public/... or /rooms/...).
    if (s.startsWith('/public/') || s.startsWith('/rooms/')) {
      return `${s3Base}${encodeURI(s)}`;
    }
    return configuredS3Base ? `${configuredS3Base}${encodeURI(s)}` : encodeURI(s);
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

  if (/^(public|rooms)\//i.test(s)) {
    return `${s3Base}/${encodeKeySegments(s)}`;
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
