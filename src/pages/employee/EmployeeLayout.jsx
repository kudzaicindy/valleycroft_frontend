import { Outlet } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';

export default function EmployeeLayout() {
  return (
    <DashboardLayout role="employee" basePath="/employee">
      <Outlet />
    </DashboardLayout>
  );
}
