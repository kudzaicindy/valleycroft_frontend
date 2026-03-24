import { axiosInstance } from './axiosInstance';

export function getEmployees(params) {
  return axiosInstance.get('/api/staff/employees', { params: params || {} });
}

export function updateEmployee(id, body) {
  return axiosInstance.put(`/api/staff/employees/${id}`, body);
}

export function createTasks(body) {
  return axiosInstance.post('/api/staff/tasks', body);
}

export function getTasksByEmployee(employeeId) {
  return axiosInstance.get(`/api/staff/tasks/${employeeId}`);
}

export function getWorklogs(params) {
  return axiosInstance.get('/api/staff/worklogs', { params: params || {} });
}

export function getMyWorklogs(params) {
  return axiosInstance.get('/api/staff/worklogs/me', { params: params || {} });
}

export function createWorklog(body) {
  return axiosInstance.post('/api/staff/worklogs', body);
}
