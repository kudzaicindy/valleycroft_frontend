import { Suspense } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import FinanceSidebar from '@/components/sidebars/FinanceSidebar';
import DashboardLayoutShell from '@/components/dashboard/DashboardLayoutShell';

export default function FinanceLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <DashboardLayoutShell
      mobileTitle="Finance"
      sidebar={
        <FinanceSidebar
          onLogout={() => {
            logout();
            navigate('/login');
          }}
        />
      }
    >
      <Suspense fallback={<div className="p-3 text-sm text-[#3D4F2A]">Loading page...</div>}>
        <Outlet />
      </Suspense>
    </DashboardLayoutShell>
  );
}
