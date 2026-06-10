import { axiosInstance } from './axiosInstance';

/**
 * Guest bookings (public website) — base path /api/guest-bookings
 * Model: GuestBooking — guestName, guestEmail, guestPhone, roomId, checkIn, checkOut, totalAmount, deposit, status, trackingCode, source, notes
 * Public: POST (submit), GET track (by email + trackingCode). Admin/CEO: list; Admin: update status/notes.
 */

/** POST /api/guest-bookings — submit booking (public) */
export function createGuestBooking(body) {
  return axiosInstance.post('/api/guest-bookings', body);
}

/** GET /api/guest-bookings/track — params: email, trackingCode (public) */
export function trackGuestBooking(params) {
  return axiosInstance.get('/api/guest-bookings/track', { params: params || {} });
}

/** GET /api/guest-bookings — list all (Admin, CEO) */
export function getGuestBookings(params) {
  return axiosInstance.get('/api/guest-bookings', { params: params || {} });
}

/** PUT /api/guest-bookings/:id — update status/notes (Admin) */
export function updateGuestBooking(id, body) {
  return axiosInstance.put(`/api/guest-bookings/${id}`, body);
}

/** DELETE /api/guest-bookings/:id — remove (Admin) */
export function deleteGuestBooking(id) {
  return axiosInstance.delete(`/api/guest-bookings/${id}`);
}

// ── PayFast guest payment ──────────────────────────────────────────────────

/** GET /api/payfast/guest-booking/options — balance/deposit info (public) */
export function getPaymentOptions(email, trackingCode) {
  return axiosInstance.get('/api/payfast/guest-booking/options', {
    params: { email, trackingCode },
  });
}

/** POST /api/payfast/guest-booking/checkout — start PayFast session (public) */
export function startPayfastCheckout(body) {
  return axiosInstance.post('/api/payfast/guest-booking/checkout', body);
}

/** GET /api/payfast/payments/:id/status — poll payment status */
export function getPaymentStatus(id) {
  return axiosInstance.get(`/api/payfast/payments/${id}/status`);
}
