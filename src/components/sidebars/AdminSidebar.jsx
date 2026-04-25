import {
  FaCalendarAlt,
  FaChartBar,
  FaCreditCard,
  FaFileAlt,
  FaFileSignature,
  FaEnvelopeOpenText,
  FaHome,
  FaMoneyBillWave,
  FaReceipt,
  FaShieldAlt,
  FaWrench,
} from 'react-icons/fa';
import PortalSidebar from '@/components/sidebars/PortalSidebar';

const sections = [
  {
    id: 'main',
    label: 'Main',
    collapsible: false,
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/admin/dashboard', icon: <FaChartBar className="w-4 h-4" /> },
      { id: 'bookings', label: 'Bookings & reservations', path: '/admin/bookings', icon: <FaCalendarAlt className="w-4 h-4" /> },
      { id: 'rooms', label: 'Rooms', path: '/admin/rooms', icon: <FaHome className="w-4 h-4" /> },
      { id: 'payments', label: 'Payments', path: '/admin/payments', icon: <FaCreditCard className="w-4 h-4" /> },
      { id: 'quotations', label: 'Quotations', path: '/admin/quotations', icon: <FaFileSignature className="w-4 h-4" /> },
      { id: 'enquiries', label: 'Enquiries', path: '/admin/enquiries', icon: <FaEnvelopeOpenText className="w-4 h-4" /> },
      { id: 'expenses', label: 'Expenses', path: '/admin/expenses', icon: <FaReceipt className="w-4 h-4" /> },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    defaultOpen: true,
    items: [
      { id: 'staff', label: 'Worker payments', path: '/admin/staff', icon: <FaMoneyBillWave className="w-4 h-4" /> },
      { id: 'inventory', label: 'Inventory & equipment', path: '/admin/inventory', icon: <FaWrench className="w-4 h-4" /> },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    defaultOpen: true,
    items: [
      { id: 'reports', label: 'Reports', path: '/admin/reports', icon: <FaFileAlt className="w-4 h-4" /> },
      { id: 'audit', label: 'Audit trail', path: '/admin/audit', icon: <FaShieldAlt className="w-4 h-4" /> },
    ],
  },
];

export default function AdminSidebar(props) {
  const { onLogout, ...rest } = props;
  return (
    <PortalSidebar
      portalLabel="Admin Portal"
      profileName="Nomsa Dlamini"
      profileRole="Operations Administrator"
      sections={sections}
      onLogout={onLogout}
      {...rest}
    />
  );
}
