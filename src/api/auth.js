import { axiosInstance } from './axiosInstance';

async function getWithAliases(paths, config) {
  let lastErr;
  for (const path of paths) {
    try {
      return await axiosInstance.get(path, config);
    } catch (e) {
      const status = e?.response?.status;
      // Only fall through on "not found" / routing differences
      if (status && status !== 404) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('Request failed');
}

/** POST /api/auth/login — returns { token, user: { _id, name, email, role } } */
export async function login(credentials) {
  const { data } = await axiosInstance.post('/api/auth/login', credentials);
  return data;
}

/** POST /api/auth/register (Admin) — body: { name, email, password, role, phone?, idNumber? } */
export async function register(payload) {
  return axiosInstance.post('/api/auth/register', payload);
}

/** GET /api/auth/me (alias: /api/admin/auth/me) — current user */
export async function me() {
  return getWithAliases(['/api/auth/me', '/api/admin/auth/me']);
}

/** PUT /api/auth/change-password — body: { currentPassword, newPassword } */
export async function changePassword(body) {
  return axiosInstance.put('/api/auth/change-password', body);
}
