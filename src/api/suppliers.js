import { axiosInstance } from './axiosInstance';

export function getSuppliers(params) {
  return axiosInstance.get('/api/suppliers', { params: params || {} });
}

export function createSupplier(body) {
  return axiosInstance.post('/api/suppliers', body);
}

export function updateSupplier(id, body) {
  return axiosInstance.put(`/api/suppliers/${id}`, body);
}

export function getSupplierPayments(id) {
  return axiosInstance.get(`/api/suppliers/${id}/payments`);
}

export function createSupplierPayment(body) {
  return axiosInstance.post('/api/suppliers/payments', body);
}
