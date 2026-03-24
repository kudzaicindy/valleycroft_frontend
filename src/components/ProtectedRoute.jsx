/**
 * Reads role from AuthContext (decoded JWT) and redirects:
 * - Not logged in → /login
 * - Wrong role for this path → /login (or role-specific dashboard)
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const ROLE_PREFIX = {
  admin: '/admin',
  ceo: '/ceo',
  finance: '/finance',
  employee: '/employee',
};

export function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: pathname }} replace />;
  }

  const role = user.role?.toLowerCase?.();
  const isAllowed = Array.isArray(allowedRoles)
    ? allowedRoles.some((r) => r.toLowerCase() === role)
    : true;

  if (!isAllowed) {
    const fallback = role && ROLE_PREFIX[role] ? ROLE_PREFIX[role] : '/login';
    return <Navigate to={fallback} replace />;
  }

  return children;
}
