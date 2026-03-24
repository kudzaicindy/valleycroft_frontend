import { axiosInstance } from './axiosInstance';

export function getHealth() {
  return axiosInstance.get('/api/health');
}
