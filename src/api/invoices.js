import { axiosInstance } from './axiosInstance';

export function getInvoices(params) {
  return axiosInstance.get('/api/invoices', { params: params || {} });
}

export function createInvoice(body) {
  return axiosInstance.post('/api/invoices', body);
}

export function updateInvoice(id, body) {
  return axiosInstance.put(`/api/invoices/${id}`, body);
}

export function getInvoicePdf(id) {
  return axiosInstance.get(`/api/invoices/${id}/pdf`);
}
