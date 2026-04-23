import { Suspense } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import CeoSidebar from '@/components/sidebars/CeoSidebar';

export default function CeoLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="dashboard" style={{ minHeight: '100vh' }}>
      <CeoSidebar
        onLogout={() => {
          logout();
          navigate('/login');
        }}
      />
      <div
        className="main-wrapper"
        style={{ marginLeft: '256px', width: 'calc(100% - 256px)', minHeight: '100vh' }}
      >
        <main className="page-content">
          <Suspense fallback={<div className="p-3 text-sm text-[#3D4F2A]">Loading page...</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
