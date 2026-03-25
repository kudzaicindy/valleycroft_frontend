import axios from 'axios';

// Vite exposes env vars at build time via `import.meta.env.*`.
// On Vercel builds, if `VITE_API_URL` isn't configured, we should not fall back
// to localhost because the browser can't reach your developer machine.
const DEFAULT_API_URL = 'https://valleycroft-backend.onrender.com';
const baseURL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

export const axiosInstance = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
    const message = err.response?.data?.message || err.message;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    const e = new Error(message || 'Request failed');
    e.response = err.response;
    const hint = err.response?.data?.hint;
    if (typeof hint === 'string' && hint.trim()) e.hint = hint.trim();
    return Promise.reject(e);
  }
);
