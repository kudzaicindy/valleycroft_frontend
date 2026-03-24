import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getPageTitle, getPageDescription } from '@/config/dashboardNav';

/**
 * Placeholder for dashboard routes not yet implemented.
 * Shows title and description from nav config based on current role and path.
 */
export default function DashboardPlaceholder() {
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role?.toLowerCase?.() ?? 'admin';
  const pathSeg = location.pathname.split('/').filter(Boolean);
  const base = pathSeg[0]; // 'admin' | 'ceo' | 'finance' | 'employee'
  const segment = pathSeg[1] ?? 'dashboard';
  const title = getPageTitle(role, segment);
  const description = getPageDescription(role, segment);

  return (
    <div className="page-header">
      <div className="page-header-left">
        <div className="page-title">{title}</div>
        {description && <div className="page-subtitle">{description}</div>}
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-body">
          <p className="text-muted" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            This page is not yet implemented. Content will be added here.
          </p>
        </div>
      </div>
    </div>
  );
}
