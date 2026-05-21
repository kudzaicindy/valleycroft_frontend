/**
 * API origin for axios and any code that needs the same base as the app.
 *
 * Priority:
 * 1. VITE_API_URL — always wins when set (trimmed, non-empty).
 * 2. Vite dev (npm run dev) — empty string = same origin; Vite proxies /api → backend
 *    (see vite.config.js server.proxy; target from VITE_API_PROXY_TARGET or VITE_API_URL_LOCAL or :5000).
 * 3. Browser on localhost / 127.0.0.1 (e.g. preview) — http://localhost:5000 (or VITE_API_URL_LOCAL).
 * 4. Otherwise — production default (Render).
 */
const PRODUCTION_DEFAULT = 'https://valleycroft-backend.onrender.com';

function stripTrailingSlashes(url) {
  return String(url || '').replace(/\/+$/, '');
}

function localDefault() {
  const fromEnv = import.meta.env.VITE_API_URL_LOCAL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return stripTrailingSlashes(fromEnv.trim());
  return 'http://localhost:5000';
}

/** VITE_API_URL must not point at the static SPA host (POST /api/* returns 405 there). */
function isMisconfiguredApiUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (/\.vercel\.app$/i.test(host) && !host.includes('backend')) return true;
    if (typeof window !== 'undefined') {
      const pageOrigin = window.location.origin;
      const apiOrigin = new URL(trimmed, pageOrigin).origin;
      if (apiOrigin === pageOrigin) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function resolveApiBaseUrl() {
  const explicit = import.meta.env.VITE_API_URL;
  if (typeof explicit === 'string' && explicit.trim() && !isMisconfiguredApiUrl(explicit)) {
    return stripTrailingSlashes(explicit.trim());
  }

  if (import.meta.env.DEV) {
    return '';
  }

  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      return localDefault();
    }
    // Production SPA on Vercel: use same-origin /api (vercel.json rewrites to Render) or direct API URL.
    if (/\.vercel\.app$/i.test(h)) {
      return '';
    }
  }

  return stripTrailingSlashes(PRODUCTION_DEFAULT);
}
