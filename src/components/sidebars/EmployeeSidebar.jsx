import { FaClipboardList, FaFileAlt, FaHome, FaMoneyBillWave, FaWrench } from 'react-icons/fa';
import PortalSidebar from '@/components/sidebars/PortalSidebar';

const sections = [
  {
    id: 'workspace',
    label: 'My Workspace',
    collapsible: false,
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/employee/dashboard', icon: <FaHome className="w-4 h-4" /> },
      { id: 'my-tasks', label: 'My Tasks', path: '/employee/my-tasks', icon: <FaClipboardList className="w-4 h-4" /> },
      { id: 'log-work', label: 'Log Work', path: '/employee/log-work', icon: <FaWrench className="w-4 h-4" /> },
      { id: 'my-logs', label: 'My Logs', path: '/employee/my-logs', icon: <FaFileAlt className="w-4 h-4" /> },
      { id: 'payslips', label: 'Payslips', path: '/employee/payslips', icon: <FaMoneyBillWave className="w-4 h-4" /> },
    ],
  },
];

export default function EmployeeSidebar({ onLogout }) {
  return (
    <PortalSidebar
      portalLabel="Employee Portal"
      profileName="Thandi Moyo"
      profileRole="Head Housekeeper"
      sections={sections}
      onLogout={onLogout}
    />
  );
}
