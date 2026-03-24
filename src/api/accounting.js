import { axiosInstance } from './axiosInstance';

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
