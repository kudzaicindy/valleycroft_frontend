import { axiosInstance } from './axiosInstance';

/** POST /api/auth/login — returns { token, user: { _id, name, email, role } } */
export async function login(credentials) {
  const { data } = await axiosInstance.post('/api/auth/login', credentials);
  return data;
}

/** POST /api/auth/register (Admin) — body: { name, email, password, role, phone?, idNumber? } */
export async function register(payload) {
  return axiosInstance.post('/api/auth/register', payload);
}

/** GET /api/auth/me — current user */
export async function me() {
  return axiosInstance.get('/api/auth/me');
}

/** PUT /api/auth/change-password — body: { currentPassword, newPassword } */
export async function changePassword(body) {
  return axiosInstance.put('/api/auth/change-password', body);
}
