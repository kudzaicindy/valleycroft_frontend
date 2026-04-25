import { axiosInstance } from './axiosInstance';

export function getQuotations(params) {
  return axiosInstance.get('/api/quotations', { params: params || {} });
}

export function createQuotation(body) {
  return axiosInstance.post('/api/quotations', body);
}

export function updateQuotation(id, body) {
  return axiosInstance.put(`/api/quotations/${id}`, body);
}

export function deleteQuotation(id) {
  return axiosInstance.delete(`/api/quotations/${id}`);
}

export function getQuotationPdf(id) {
  return axiosInstance.get(`/api/quotations/${id}/pdf`, { responseType: 'blob' });
}

export function sendQuotationEmail(id, body) {
  return axiosInstance.post(`/api/quotations/${id}/send-email`, body || {});
}

