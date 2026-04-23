/**
 * Reads role from AuthContext (decoded JWT) and redirects:
 * - Not logged in → /login
 * - Wrong role for this path → /login
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

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
    return <Navigate to="/login" state={{ from: pathname }} replace />;
  }

  return children;
}
