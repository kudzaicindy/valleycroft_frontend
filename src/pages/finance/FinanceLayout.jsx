import { Outlet } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';

export default function FinanceLayout() {
  return (
    <DashboardLayout role="finance" basePath="/finance">
      <Outlet />
    </DashboardLayout>
  );
}
