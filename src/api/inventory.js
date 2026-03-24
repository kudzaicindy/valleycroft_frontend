import { axiosInstance } from './axiosInstance';

export function getStock(params) {
  return axiosInstance.get('/api/inventory/stock', { params: params || {} });
}

export function createStockItem(body) {
  return axiosInstance.post('/api/inventory/stock', body);
}

export function updateStockItem(id, body) {
  return axiosInstance.put(`/api/inventory/stock/${id}`, body);
}

export function deleteStockItem(id) {
  return axiosInstance.delete(`/api/inventory/stock/${id}`);
}

export function getEquipment(params) {
  return axiosInstance.get('/api/inventory/equipment', { params: params || {} });
}

export function createEquipment(body) {
  return axiosInstance.post('/api/inventory/equipment', body);
}

export function updateEquipment(id, body) {
  return axiosInstance.put(`/api/inventory/equipment/${id}`, body);
}
