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

export function getDebtors(params) {
  return axiosInstance.get('/api/debtors', { params: params || {} });
}

export function createDebtor(body) {
  return axiosInstance.post('/api/debtors', body);
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
    ['/api/admin/debtors/pending-bookings', '/api/debtors/pending-bookings'],
    params
  );
}

/** Record payment against a debtor and auto-update debtor status. */
export function recordDebtorPayment(id, body) {
  return postWithAliases(
    [`/api/admin/debtors/${id}/payments`, `/api/debtors/${id}/payments`],
    body
  );
}
