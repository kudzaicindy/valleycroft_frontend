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
  throw lastErr || new Error('No matching API route found.');
}

export function getTransactions(params) {
  return axiosInstance.get('/api/finance/transactions', { params: params || {} });
}

/**
 * Create a transaction. Do not send `journalEntryId` — the API sets it when the ledger posts.
 * Body: type, category, description, amount, debitAccount, creditAccount, date?, reference?, booking?
 * Send `idempotencyKey` (or header) so duplicate submits (e.g. Strict Mode) do not create two documents.
 */
export function createTransaction(body, { idempotencyKey } = {}) {
  const config = idempotencyKey
    ? { headers: { 'Idempotency-Key': idempotencyKey } }
    : {};
  return axiosInstance.post('/api/finance/transactions', body, config);
}

/** Same shape as create; never include read-only `journalEntryId`. */
export function updateTransaction(id, body) {
  return axiosInstance.put(`/api/finance/transactions/${id}`, body);
}

export function deleteTransaction(id) {
  return axiosInstance.delete(`/api/finance/transactions/${id}`);
}

export function getCashflow(params) {
  return getWithAliases(
    [
      '/api/finance/cashflow',
      '/api/finance/cash-flow',
      '/api/statements/cashflow',
      '/api/statements/cash-flow',
    ],
    params
  );
}

export function getIncomeStatement(params) {
  return getWithAliases(
    [
      '/api/finance/income-statement',
      '/api/statements/income-statement',
    ],
    params
  );
}

export function getBalanceSheet(params) {
  return axiosInstance.get('/api/finance/balance-sheet', { params: params || {} });
}

export function getSalary(params) {
  return axiosInstance.get('/api/finance/salary', { params: params || {} });
}

export function createSalary(body) {
  return axiosInstance.post('/api/finance/salary', body);
}

export function getSalaryByEmployee(employeeId) {
  return axiosInstance.get(`/api/finance/salary/employee/${employeeId}`);
}
