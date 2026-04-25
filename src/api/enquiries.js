import { axiosInstance } from './axiosInstance';
import { listFromSuccessEnvelope, metaFromSuccessEnvelope } from '@/utils/apiEnvelope';

/**
 * Normalizes list + pagination from various backend envelope shapes.
 * @param {unknown} payload — body already unwrapped by axios interceptor when applicable
 */
export function extractEnquiriesListMeta(payload) {
  if (payload == null) return { list: [], meta: {} };
  if (Array.isArray(payload)) {
    return { list: payload, meta: {} };
  }
  if (typeof payload === 'object') {
    const inner =
      Array.isArray(payload.enquiries) ? payload.enquiries
      : Array.isArray(payload.items) ? payload.items
      : Array.isArray(payload.results) ? payload.results
      : Array.isArray(payload.records) ? payload.records
      : null;
    if (inner) {
      const meta = {
        ...metaFromSuccessEnvelope(payload),
        ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
        page: payload.page ?? payload.meta?.page,
        limit: payload.limit ?? payload.meta?.limit,
        total: payload.total ?? payload.meta?.total,
        totalPages: payload.totalPages ?? payload.meta?.totalPages,
      };
      return { list: inner, meta };
    }
  }
  const list = listFromSuccessEnvelope(payload);
  return { list, meta: metaFromSuccessEnvelope(payload) };
}

export async function createPublicEnquiry(body) {
  const res = await axiosInstance.post('/api/enquiries', body);
  return res.data;
}

export async function getEnquiries(params) {
  const res = await axiosInstance.get('/api/enquiries', { params: params || {} });
  return res.data;
}

export async function getEnquiryById(id) {
  const res = await axiosInstance.get(`/api/enquiries/${id}`);
  return res.data;
}

export async function respondToEnquiry(id, body) {
  const res = await axiosInstance.post(`/api/enquiries/${id}/respond`, body);
  return res.data;
}

export async function closeEnquiry(id) {
  const res = await axiosInstance.patch(`/api/enquiries/${id}/close`, {});
  return res.data;
}
