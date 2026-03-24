import { Outlet } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';

export default function CeoLayout() {
  return (
    <DashboardLayout role="ceo" basePath="/ceo">
      <Outlet />
    </DashboardLayout>
  );
}
