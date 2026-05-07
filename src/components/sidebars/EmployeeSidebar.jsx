import { FaClipboardList, FaFileAlt, FaHome, FaMoneyBillWave, FaReceipt, FaWrench } from 'react-icons/fa';
import PortalSidebar from '@/components/sidebars/PortalSidebar';
import { useAuth } from '@/context/AuthContext';

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
      { id: 'expenses', label: 'Expenses', path: '/employee/expenses', icon: <FaReceipt className="w-4 h-4" /> },
    ],
  },
];

export default function EmployeeSidebar(props) {
  const { onLogout, ...rest } = props;
  const { user } = useAuth();
  const profileName = (user?.name || user?.email || '').toString().trim() || '—';
  const profileEmail = user?.email ? String(user.email) : '';
  const profileRole = user?.role ? String(user.role).toUpperCase() : '';
  return (
    <PortalSidebar
      portalLabel="Employee Portal"
      profileName={profileName}
      profileEmail={profileEmail}
      profileRole={profileRole}
      sections={sections}
      onLogout={onLogout}
      {...rest}
    />
  );
}
