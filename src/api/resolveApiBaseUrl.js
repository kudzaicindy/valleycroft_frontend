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

export function resolveApiBaseUrl() {
  const explicit = import.meta.env.VITE_API_URL;
  if (typeof explicit === 'string' && explicit.trim()) {
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
  }

  return stripTrailingSlashes(PRODUCTION_DEFAULT);
}
