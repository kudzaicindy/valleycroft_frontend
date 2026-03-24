import { axiosInstance } from './axiosInstance';

export function getAuditLog(params) {
  return axiosInstance.get('/api/audit', { params: params || {} });
}

export function getAuditByEntity(entityName) {
  return axiosInstance.get(`/api/audit/entity/${entityName}`);
}

export function getAuditByUser(userId) {
  return axiosInstance.get(`/api/audit/user/${userId}`);
}
