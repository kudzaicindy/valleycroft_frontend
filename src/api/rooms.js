import { axiosInstance } from './axiosInstance';

/**
 * GET /api/rooms
 * Optional params: checkIn, checkOut (YYYY-MM-DD) — when provided, each room includes availableForDates: true | false for that range.
 */
export function getRooms(params = {}) {
  return axiosInstance.get('/api/rooms', { params });
}

/**
 * GET /api/rooms/:id
 * Optional params: checkIn, checkOut (YYYY-MM-DD) — when provided, response includes availableForDates and optionally bookedBy.
 */
export function getRoom(id, params = {}) {
  return axiosInstance.get(`/api/rooms/${id}`, { params });
}

/**
 * GET /api/rooms/:id/bookings — list guest bookings for this room.
 * Optional params: checkIn, checkOut (YYYY-MM-DD) to only get bookings overlapping that range.
 * Response: { success, data: [ { _id, guestName, guestEmail, guestPhone, checkIn, checkOut, status, trackingCode, totalAmount, deposit } ] }
 */
export function getRoomBookings(roomId, params = {}) {
  return axiosInstance.get(`/api/rooms/${roomId}/bookings`, { params });
}

export function createRoom(body) {
  return axiosInstance.post('/api/rooms', body);
}

export function updateRoom(id, body) {
  return axiosInstance.put(`/api/rooms/${id}`, body);
}

export function deleteRoom(id) {
  return axiosInstance.delete(`/api/rooms/${id}`);
}
