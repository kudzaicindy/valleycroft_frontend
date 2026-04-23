import { axiosInstance } from './axiosInstance';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';

async function getWithAliases(paths, params) {
  let lastError;
  for (const path of paths) {
    try {
      return await axiosInstance.get(path, { params, skipAdminNamespaceRewrite: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Request failed');
}

async function postWithAliases(paths, body) {
  let lastError;
  for (const path of paths) {
    try {
      return await axiosInstance.post(path, body, { skipAdminNamespaceRewrite: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Request failed');
}

async function putWithAliases(paths, body) {
  let lastError;
  for (const path of paths) {
    try {
      return await axiosInstance.put(path, body, { skipAdminNamespaceRewrite: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Request failed');
}

async function putWithAliasesFetch(paths, body, token) {
  const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null);
  const base = resolveApiBaseUrl().replace(/\/+$/, '');
  let lastError;

  for (const path of paths) {
    const res = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (res.status === 404 || res.status === 405) {
      lastError = new Error(`Request failed (${res.status})`);
      continue;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || (data && data.success === false)) {
      throw new Error(data?.message || `Update failed (${res.status})`);
    }

    return data?.data !== undefined ? data.data : data;
  }

  throw lastError || new Error('Request failed');
}

async function deleteWithAliases(paths) {
  let lastError;
  for (const path of paths) {
    try {
      return await axiosInstance.delete(path, { skipAdminNamespaceRewrite: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Request failed');
}

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
  const id = encodeURIComponent(roomId);
  const paths = [
    `/api/admin/rooms/${id}/images`,
    `/api/admin/rooms/${id}/photos`,
    `/api/rooms/${id}/images`,
    `/api/rooms/${id}/photos`,
  ];

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
  return getWithAliases(['/api/admin/rooms', '/api/rooms'], params);
}

/**
 * GET /api/rooms/:id
 * Optional params: checkIn, checkOut (YYYY-MM-DD) — when provided, response includes availableForDates and optionally bookedBy.
 */
export function getRoom(id, params = {}) {
  return getWithAliases([`/api/admin/rooms/${id}`, `/api/rooms/${id}`], params);
}

/**
 * GET /api/rooms/:id/bookings — list guest bookings for this room.
 * Optional params: checkIn, checkOut (YYYY-MM-DD) to only get bookings overlapping that range.
 * Response: { success, data: [ { _id, guestName, guestEmail, guestPhone, checkIn, checkOut, status, trackingCode, totalAmount, deposit } ] }
 */
export function getRoomBookings(roomId, params = {}) {
  return getWithAliases([`/api/admin/rooms/${roomId}/bookings`, `/api/rooms/${roomId}/bookings`], params);
}

export function createRoom(body) {
  return postWithAliases(['/api/admin/rooms', '/api/rooms'], body);
}

export function updateRoom(id, body, token) {
  return putWithAliasesFetch(
    [`/api/admin/rooms/${id}`, `/api/rooms/${id}`],
    body,
    token
  );
}

export function deleteRoom(id) {
  return deleteWithAliases([`/api/admin/rooms/${id}`, `/api/rooms/${id}`]);
}
