import { axiosInstance } from './axiosInstance';

export function getDebtors(params) {
  return axiosInstance.get('/api/debtors', { params: params || {} });
}

export function createDebtor(body) {
  return axiosInstance.post('/api/debtors', body);
}

export function updateDebtor(id, body) {
  return axiosInstance.put(`/api/debtors/${id}`, body);
}

export function deleteDebtor(id) {
  return axiosInstance.delete(`/api/debtors/${id}`);
}
