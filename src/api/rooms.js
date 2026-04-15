import { axiosInstance } from './axiosInstance';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';

/**
 * Normalize upload API response to URL/path strings for PUT /api/rooms/:id { images }.
 * Handles { urls }, { images }, arrays, or a full room object with images.
 */
export function normalizeRoomImageUploadResult(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    return result
      .map((x) => (typeof x === 'string' ? x : x?.url || x?.path || x?.src || ''))
      .filter(Boolean);
  }
  if (Array.isArray(result.images)) {
    return normalizeRoomImageUploadResult(result.images);
  }
  const urls = result.urls || result.paths || result.imageUrls || result.fileUrls;
  if (Array.isArray(urls)) {
    return normalizeRoomImageUploadResult(urls);
  }
  if (typeof result.url === 'string') return [result.url];
  if (typeof result.path === 'string') return [result.path];
  return [];
}

/**
 * POST multipart images for a room. Tries common paths; backend should implement at least one.
 * Form field name: `images` (repeat for each file) — matches typical multer.array('images').
 */
export async function uploadRoomImages(roomId, files) {
  if (!roomId || !files?.length) return null;
  const list = Array.from(files).filter((f) => f instanceof File);
  if (!list.length) return null;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const base = resolveApiBaseUrl().replace(/\/$/, '');
  const paths = [`/api/rooms/${encodeURIComponent(roomId)}/images`, `/api/rooms/${encodeURIComponent(roomId)}/photos`];

  let lastStatus = 0;
  for (const path of paths) {
    const fd = new FormData();
    list.forEach((f) => fd.append('images', f));
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    lastStatus = res.status;
    if (res.status === 404) continue;

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || `Image upload failed (${res.status})`);
    }
    if (json && json.success === false) {
      throw new Error(json.message || 'Image upload failed');
    }
    return json?.data !== undefined ? json.data : json;
  }

  throw new Error(
    lastStatus === 404
      ? 'Server has no room image upload route (tried POST …/images and …/photos). Add multipart POST /api/rooms/:id/images with field "images".'
      : `Image upload failed (${lastStatus})`
  );
}

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
