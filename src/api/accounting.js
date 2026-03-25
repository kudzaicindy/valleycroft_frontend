import { axiosInstance } from './axiosInstance';

async function getWithAliases(paths, params) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.get(path, { params: params || {} });
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching accounts route found.');
}

/**
 * Chart of accounts — prefers `/api/accounting/accounts`, falls back to legacy finance routes.
 */
export function getAccounts(params) {
  return getWithAliases(
    ['/api/accounting/accounts', '/api/finance/accounts', '/api/finance/chart-of-accounts'],
    params
  );
}

/** `POST /api/accounting/accounts` — name, type, subType, normalBalance, code | autoCode, optional opening fields. */
export function createAccount(body) {
  return axiosInstance.post('/api/accounting/accounts', body);
}

/** `PUT /api/accounting/accounts/:id` — opening fields, name, isActive, parentCode (not code). */
export function updateAccount(accountId, body) {
  return axiosInstance.put(`/api/accounting/accounts/${accountId}`, body);
}

/**
 * Ledger / double-entry accounting API (`/api/accounting`).
 * Paths follow common REST shapes; align with your backend ACCOUNTING.md if names differ.
 */

export function getAccountingPl(params) {
  return axiosInstance.get('/api/accounting/pl', { params: params || {} });
}

export function getAccountingBalanceSheet(params) {
  return axiosInstance.get('/api/accounting/balance-sheet', { params: params || {} });
}

async function getWithPathFallback(primaryPath, fallbackPath, params) {
  try {
    return await axiosInstance.get(primaryPath, { params: params || {} });
  } catch (err) {
    if (err?.response?.status === 404) {
      return axiosInstance.get(fallbackPath, { params: params || {} });
    }
    throw err;
  }
}

export function getAccountingCashflow(params) {
  return getWithPathFallback('/api/accounting/cashflow', '/api/accounting/cash-flow', params);
}

export function getJournalEntries(params) {
  return axiosInstance.get('/api/accounting/journal-entries', { params: params || {} });
}
