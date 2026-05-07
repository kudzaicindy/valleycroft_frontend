import {
  FaBalanceScale,
  FaBook,
  FaBuilding,
  FaCalendarAlt,
  FaChartBar,
  FaChartLine,
  FaFileAlt,
  FaHistory,
  FaReceipt,
  FaUserGraduate,
  FaUsers,
  FaClipboardList,
  FaEnvelopeOpenText,
} from 'react-icons/fa';
import PortalSidebar from '@/components/sidebars/PortalSidebar';
import { useAuth } from '@/context/AuthContext';

const sections = [
  {
    id: 'overview',
    label: 'Overview',
    collapsible: false,
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/ceo/dashboard', icon: <FaChartBar className="w-4 h-4" /> },
      { id: 'bookings', label: 'Bookings', path: '/ceo/bookings', icon: <FaCalendarAlt className="w-4 h-4" /> },
      { id: 'enquiries', label: 'Enquiries', path: '/ceo/enquiries', icon: <FaEnvelopeOpenText className="w-4 h-4" /> },
      { id: 'expenses', label: 'Expenses', path: '/ceo/expenses', icon: <FaReceipt className="w-4 h-4" /> },
    ],
  },
  {
    id: 'statements',
    label: 'Statements',
    defaultOpen: true,
    items: [
      { id: 'cashflow', label: 'Cash Flow', path: '/ceo/cashflow', icon: <FaChartLine className="w-4 h-4" /> },
      { id: 'income-statement', label: 'Income Statement', path: '/ceo/income-statement', icon: <FaChartLine className="w-4 h-4" /> },
      { id: 'balance-sheet', label: 'Balance Sheet', path: '/ceo/balance-sheet', icon: <FaBalanceScale className="w-4 h-4" /> },
      { id: 'chart-of-accounts', label: 'Chart of accounts', path: '/ceo/chart-of-accounts', icon: <FaClipboardList className="w-4 h-4" /> },
      { id: 'ledger', label: 'Ledger', path: '/ceo/ledger', icon: <FaBook className="w-4 h-4" /> },
    ],
  },
  {
    id: 'parties',
    label: 'Parties & People',
    defaultOpen: true,
    items: [
      { id: 'debtors', label: 'Debtors', path: '/ceo/debtors', icon: <FaUserGraduate className="w-4 h-4" /> },
      { id: 'suppliers', label: 'Suppliers', path: '/ceo/suppliers', icon: <FaBuilding className="w-4 h-4" /> },
      { id: 'staff', label: 'Worker payments', path: '/ceo/staff', icon: <FaUsers className="w-4 h-4" /> },
      { id: 'reports', label: 'Reports', path: '/ceo/reports', icon: <FaFileAlt className="w-4 h-4" /> },
      { id: 'audit', label: 'Audit', path: '/ceo/audit', icon: <FaHistory className="w-4 h-4" /> },
    ],
  },
];

export default function CeoSidebar(props) {
  const { onLogout, ...rest } = props;
  const { user } = useAuth();
  const profileName = (user?.name || user?.email || '').toString().trim() || '—';
  const profileEmail = user?.email ? String(user.email) : '';
  const profileRole = user?.role ? String(user.role).toUpperCase() : '';
  return (
    <PortalSidebar
      portalLabel="CEO Portal"
      profileName={profileName}
      profileEmail={profileEmail}
      profileRole={profileRole}
      sections={sections}
      onLogout={onLogout}
      {...rest}
    />
  );
}
