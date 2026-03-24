import { axiosInstance } from './axiosInstance';

export function getRefunds(params) {
  return axiosInstance.get('/api/refunds', { params: params || {} });
}

export function createRefund(body) {
  return axiosInstance.post('/api/refunds', body);
}

export function updateRefund(id, body) {
  return axiosInstance.put(`/api/refunds/${id}`, body);
}
