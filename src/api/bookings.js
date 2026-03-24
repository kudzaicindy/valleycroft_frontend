import { axiosInstance } from './axiosInstance';

/**
 * Internal bookings (staff/admin) — base path /api/bookings
 * Model: Booking — guestName, guestEmail, guestPhone, type (bnb|event), checkIn, checkOut, eventDate, amount, deposit, status, notes, createdBy
 * Access: Admin (full), CEO (list, availability, get one)
 */

/** GET /api/bookings — list, paginated (Admin, CEO) */
export function getBookings(params = {}) {
  return axiosInstance.get('/api/bookings', { params });
}

/** GET /api/bookings/availability — checkIn, checkOut, type=bnb|event (Admin, CEO) */
export function getAvailability(params) {
  return axiosInstance.get('/api/bookings/availability', { params });
}

/** GET /api/bookings/:id — one booking (Admin, CEO) */
export function getBooking(id) {
  return axiosInstance.get(`/api/bookings/${id}`);
}

/** POST /api/bookings — create (Admin) */
export function createBooking(body) {
  return axiosInstance.post('/api/bookings', body);
}

/** PUT /api/bookings/:id — update (Admin) */
export function updateBooking(id, body) {
  return axiosInstance.put(`/api/bookings/${id}`, body);
}

/** DELETE /api/bookings/:id — remove (Admin) */
export function deleteBooking(id) {
  return axiosInstance.delete(`/api/bookings/${id}`);
}
