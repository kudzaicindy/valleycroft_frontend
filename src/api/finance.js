import { axiosInstance } from './axiosInstance';

async function getWithAliases(paths, params, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.get(path, { ...(config || {}), params: params || {} });
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching API route found.');
}

async function postWithAliases(paths, body, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.post(path, body, config || {});
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching API route found.');
}

async function putWithAliases(paths, body, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.put(path, body, config || {});
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching API route found.');
}

async function deleteWithAliases(paths, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.delete(path, config || {});
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching API route found.');
}

/** GET /api/finance/transactions — server allows `limit` up to this value when date filters are used. */
export const FINANCE_TRANSACTIONS_MAX_LIMIT = 500;

export function getTransactions(params) {
  return getWithAliases(
    ['/api/finance/transactions', '/api/admin/finance/transactions'],
    params
  );
}

/** Rolled-up KPIs: income/expense MTD, debtors, bookings snapshot, activity, etc. */
export function getFinanceDashboard(params) {
  return axiosInstance.get('/api/finance/dashboard', { params: params || {} });
}

/** Transaction rows in ledger-style columns (when you need GL-shaped rows from finance). */
export function getTransactionsLedgerFormat(params) {
  return axiosInstance.get('/api/finance/transactions-ledger-format', { params: params || {} });
}

/** Discovery: statement URL patterns for building a reports menu. */
export function getStatementsCatalog() {
  return axiosInstance.get('/api/statements/catalog');
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
  return postWithAliases(
    ['/api/finance/transactions', '/api/admin/finance/transactions'],
    body,
    config
  );
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
  return getWithAliases(
    ['/api/finance/balance-sheet', '/api/accounting/balance-sheet', '/api/statements/balance-sheet'],
    params
  );
}

/** Per-account transaction drilldown: statements/accounts/:code/transactions (with accounting alias). */
export function getAccountTransactions(accountCode, params) {
  const code = encodeURIComponent(String(accountCode || '').trim());
  return getWithAliases(
    [
      `/api/statements/accounts/${code}/transactions`,
      `/api/accounting/accounts/${code}/transactions`,
    ],
    params
  );
}

/** Worker / salary payments (Staff page, Salary page, payslips). Tries finance-scoped routes first — plain `/api/salary` often 404s if the API only mounts under `/api/finance`. */
const SALARY_GET_PATHS = ['/api/finance/salary', '/api/accounting/salary', '/api/salary'];
const SALARY_POST_PATHS = ['/api/finance/salary', '/api/accounting/salary', '/api/salary'];

function salaryPathsWithId(id) {
  const enc = encodeURIComponent(String(id ?? '').trim());
  return [
    `/api/finance/salary/${enc}`,
    `/api/accounting/salary/${enc}`,
    `/api/salary/${enc}`,
  ];
}

export function getSalary(params) {
  return getWithAliases(SALARY_GET_PATHS, params);
}

export function createSalary(body) {
  return postWithAliases(SALARY_POST_PATHS, body);
}

export function updateSalary(id, body) {
  return putWithAliases(salaryPathsWithId(id), body);
}

export function deleteSalary(id) {
  return deleteWithAliases(salaryPathsWithId(id));
}

export function getSalaryByEmployee(employeeId) {
  const enc = encodeURIComponent(String(employeeId ?? '').trim());
  return getWithAliases(
    [
      `/api/finance/salary/employee/${enc}`,
      `/api/accounting/salary/employee/${enc}`,
      `/api/salary/employee/${enc}`,
    ],
    {}
  );
}
