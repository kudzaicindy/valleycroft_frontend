import axios from 'axios';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';

const baseURL = resolveApiBaseUrl();

export const axiosInstance = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

function readRoleFromToken(token) {
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload?.role ?? payload?.role_id ?? '').toLowerCase();
  } catch {
    return '';
  }
}

function toAdminApiUrl(url) {
  if (typeof url !== 'string') return url;
  if (!url.startsWith('/api/')) return url;
  if (url.startsWith('/api/admin/')) return url;
  if (url.startsWith('/api/auth/')) return url;
  return url.replace(/^\/api\//, '/api/admin/');
}

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const role = readRoleFromToken(token);
  if (role === 'admin' && typeof config.url === 'string') {
    config.url = toAdminApiUrl(config.url);
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && body.success === false) {
      const msg = body.message || response.statusText || 'Request failed';
      const err = new Error(msg);
      err.response = response;
      return Promise.reject(err);
    }
    return { ...response, data: body?.data !== undefined ? body.data : body };
  },
  (err) => {
    const status = err.response?.status;
    const data = err.response?.data;
    const message =
      (data && typeof data === 'object' && typeof data.message === 'string' && data.message.trim()) ||
      (typeof data === 'string' && data.trim()) ||
      err.message;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.replace('/login');
    }
    const e = new Error(message || 'Request failed');
    e.response = err.response;
    const hint = data && typeof data === 'object' && typeof data.hint === 'string' ? data.hint.trim() : '';
    if (hint) e.hint = hint;
    else if (status === 502 || status === 503 || status === 504) {
      e.hint =
        import.meta.env.DEV
          ? 'Dev proxy could not get a full response from the API (connection reset or server down). Start the backend, confirm VITE_API_PROXY_TARGET matches it, and check API logs for crashes on this request.'
          : 'The booking service is temporarily unavailable. Try again shortly or contact support if it persists.';
    }
    return Promise.reject(e);
  }
);
