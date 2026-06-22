import { axiosInstance } from './axiosInstance';
import { listFromSuccessEnvelope, unwrapApiBody } from '@/utils/apiEnvelope';

async function getWithAliases(paths) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.get(path);
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching API route found.');
}

async function putWithAliases(paths, body) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.put(path, body);
    } catch (err) {
      if (err?.response?.status !== 404) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching API route found.');
}

function normalizeListResponse(res) {
  const payload = res?.data !== undefined ? res.data : res;
  const body = unwrapApiBody(payload) ?? payload;
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray(body.addOns)) return body.addOns;
  return listFromSuccessEnvelope(payload);
}

/** GET /api/food-add-ons — public active catalogue (booking form, landing). */
export async function getFoodAddOns() {
  const res = await axiosInstance.get('/api/food-add-ons');
  return normalizeListResponse(res);
}

/** GET /api/food-add-ons/manage — all add-ons including inactive (admin). */
export async function getFoodAddOnsManage() {
  const res = await getWithAliases([
    '/api/food-add-ons/manage',
    '/api/admin/food-add-ons/manage',
  ]);
  return normalizeListResponse(res);
}

/** PUT /api/food-add-ons/:addOnId — update label, unitPrice, isActive (admin). */
export function updateFoodAddOn(addOnId, body) {
  const id = encodeURIComponent(String(addOnId));
  return putWithAliases(
    [`/api/admin/food-add-ons/${id}`, `/api/food-add-ons/${id}`],
    body
  );
}
