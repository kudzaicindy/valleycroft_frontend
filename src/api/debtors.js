import { axiosInstance } from './axiosInstance';

async function getWithAliases(paths, params, config = {}) {
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

async function postWithAliases(paths, body) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.post(path, body);
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching API route found.');
}

function debtorPaths(suffix = '') {
  const s = suffix.startsWith('/') ? suffix : suffix ? `/${suffix}` : '';
  return [`/api/finance/debtors${s}`, `/api/debtors${s}`];
}

export function getDebtors(params) {
  return getWithAliases(debtorPaths(), params);
}

export function createDebtor(body) {
  return postWithAliases(debtorPaths(), body);
}

export function updateDebtor(id, body) {
  return axiosInstance.put(`/api/debtors/${id}`, body);
}

export function deleteDebtor(id) {
  return axiosInstance.delete(`/api/debtors/${id}`);
}

/** Booking-related debtors that still owe money (status outstanding/partial, balance > 0). */
export function getPendingBookingDebtors(params) {
  return getWithAliases(
    ['/api/finance/debtors/pending-bookings', '/api/debtors/pending-bookings', '/api/admin/debtors/pending-bookings'],
    params
  );
}

/** Record payment against a debtor and auto-update debtor status. */
export function recordDebtorPayment(id, body) {
  return postWithAliases(debtorPaths(`${id}/payments`), body);
}

/** List payments / receipts for a debtor. */
export function getDebtorPayments(id, params) {
  return getWithAliases(debtorPaths(`${id}/payments`), params);
}

/** Download receipt PDF for a debtor payment. */
export function getDebtorPaymentPdf(debtorId, paymentId) {
  return getWithAliases(
    debtorPaths(`${debtorId}/payments/${paymentId}/pdf`),
    undefined,
    { responseType: 'blob' }
  );
}

/** Email receipt PDF. Body optional: `{ to, subject, message }`. */
export function sendDebtorPaymentEmail(debtorId, paymentId, body = {}) {
  return postWithAliases(debtorPaths(`${debtorId}/payments/${paymentId}/send-email`), body || {});
}

/** Prefer human code (DBT-…) over Mongo id. */
export function debtorCode(debtorOrRow) {
  if (!debtorOrRow || typeof debtorOrRow !== 'object') return '';
  return String(
    debtorOrRow.debtorNumber
      || debtorOrRow.debtor_number
      || debtorOrRow._raw?.debtorNumber
      || ''
  ).trim();
}

/** Prefer human receipt code (RCP-…) over Mongo id. */
export function receiptCode(paymentOrMeta) {
  if (!paymentOrMeta || typeof paymentOrMeta !== 'object') return '';
  return String(
    paymentOrMeta.receiptNumber
      || paymentOrMeta.receipt_number
      || paymentOrMeta.meta?.receiptNumber
      || ''
  ).trim();
}
