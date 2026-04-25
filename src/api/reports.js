import { axiosInstance } from './axiosInstance';

function roleFromToken() {
  const token = localStorage.getItem('token');
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload?.role ?? payload?.role_id ?? '').toLowerCase();
  } catch {
    return '';
  }
}

function reportPathAliases(suffix) {
  const tail = suffix.startsWith('/') ? suffix : `/${suffix}`;
  const role = roleFromToken();

  if (role === 'finance') {
    return [`/api/finance/reports${tail}`, `/api/reports${tail}`, `/api/ceo/reports${tail}`];
  }
  if (role === 'ceo') {
    return [`/api/ceo/reports${tail}`, `/api/finance/reports${tail}`, `/api/reports${tail}`];
  }
  if (role === 'admin') {
    // Prefer explicit admin namespace so compile (POST), list (GET), and PDF hit the routes that run AI / saved snapshots.
    return [`/api/admin/reports${tail}`, `/api/reports${tail}`];
  }
  return [`/api/reports${tail}`, `/api/finance/reports${tail}`, `/api/ceo/reports${tail}`];
}

async function getWithAliases(paths, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.get(path, config || {});
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404 && status !== 405) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching report endpoint found.');
}

async function postWithAliases(paths, body, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.post(path, body, config || {});
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404 && status !== 405) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching report endpoint found.');
}

async function deleteWithAliases(paths, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.delete(path, config || {});
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404 && status !== 405) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching report delete endpoint found.');
}

export function getWeeklyReport() {
  return getWithAliases(reportPathAliases('/weekly'));
}

export function getMonthlyReport() {
  return getWithAliases(reportPathAliases('/monthly'));
}

export function getQuarterlyReport() {
  return getWithAliases(reportPathAliases('/quarterly'));
}

export function getAnnualReport() {
  return getWithAliases(reportPathAliases('/annual'));
}

export function exportReport(type) {
  return getWithAliases(reportPathAliases(`/export/${type}`));
}

const AI_SUMMARY_PROVIDERS = new Set(['openai', 'openrouter', 'gemini', 'auto']);

function normalizeAiSummaryProvider(provider) {
  const pr = String(provider || 'auto').toLowerCase();
  return AI_SUMMARY_PROVIDERS.has(pr) ? pr : 'auto';
}

/**
 * Compile & save: POST only — body `{ period, provider? }`.
 * `provider`: `openai` | `openrouter` | `gemini` | `auto` (default, server fallback chain).
 */
export function compileAiReport(period, opts = {}) {
  const p = String(period || 'monthly').toLowerCase();
  const provider = normalizeAiSummaryProvider(opts.provider);
  return postWithAliases(reportPathAliases('/ai-summary'), { period: p, provider });
}

/** @deprecated use compileAiReport */
export function getAiSummary(period, opts) {
  return compileAiReport(period, opts);
}

/**
 * List saved reports: GET `/ai-summaries` only (e.g. `?period=monthly&page=1&limit=100`). Never POST here.
 */
export async function listSavedAiReports(params = {}) {
  const merged = {
    page: 1,
    limit: 100,
    ...params,
  };
  return getWithAliases(reportPathAliases('/ai-summaries'), { params: merged });
}

/**
 * Download PDF: GET `.../ai-summary/pdf?reportId=<id>` (period optional).
 * `provider` is sent when set and not `auto` (used if the server must regenerate; snapshots ignore it).
 */
export function downloadAiSummaryPdf({ reportId, period, provider } = {}) {
  const params = {};
  if (reportId != null && String(reportId).trim()) params.reportId = String(reportId).trim();
  if (period != null && String(period).trim()) params.period = String(period).trim();
  const pr = normalizeAiSummaryProvider(provider);
  if (pr && pr !== 'auto') params.provider = pr;
  if (!params.reportId) {
    return Promise.reject(new Error('reportId is required for server PDF download.'));
  }
  return getWithAliases(reportPathAliases('/ai-summary/pdf'), { params, responseType: 'blob' });
}

/**
 * Delete a persisted report by id (Mongo/ObjectId).
 * Many backends use query params (e.g. ?reportId=) rather than DELETE .../ai-summary/:id — try those first.
 */
export async function deleteSavedAiReport(reportId) {
  const id = String(reportId || '').trim();
  if (!id) throw new Error('reportId is required to delete a saved report.');
  const enc = encodeURIComponent(id);

  const attempts = [
    { suffix: '/ai-summary', config: { params: { reportId: id } } },
    { suffix: '/ai-summary', config: { params: { id } } },
    { suffix: '/ai-summaries', config: { params: { reportId: id } } },
    { suffix: '/ai-summaries', config: { params: { id } } },
    { suffix: `/ai-summaries/${enc}`, config: {} },
    { suffix: `/ai-summary/${enc}`, config: {} },
  ];

  let lastErr;
  for (const { suffix, config } of attempts) {
    try {
      return await deleteWithAliases(reportPathAliases(suffix), config);
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404 && status !== 405) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not delete report: no matching DELETE route.');
}
