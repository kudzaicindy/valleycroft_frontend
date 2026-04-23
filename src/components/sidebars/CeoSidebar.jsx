import {
  FaBalanceScale,
  FaBook,
  FaBuilding,
  FaCalendarAlt,
  FaChartBar,
  FaChartLine,
  FaDollarSign,
  FaFileAlt,
  FaHistory,
  FaUserGraduate,
  FaUsers,
  FaClipboardList,
} from 'react-icons/fa';
import PortalSidebar from '@/components/sidebars/PortalSidebar';

const sections = [
  {
    id: 'overview',
    label: 'Overview',
    collapsible: false,
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/ceo/dashboard', icon: <FaChartBar className="w-4 h-4" /> },
      { id: 'bookings', label: 'Bookings', path: '/ceo/bookings', icon: <FaCalendarAlt className="w-4 h-4" /> },
      { id: 'finance', label: 'Finance', path: '/ceo/finance', icon: <FaDollarSign className="w-4 h-4" /> },
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

export default function CeoSidebar({ onLogout }) {
  return (
    <PortalSidebar
      portalLabel="CEO Portal"
      profileName="Catherine Watkins"
      profileRole="Chief Executive Officer"
      sections={sections}
      onLogout={onLogout}
    />
  );
}
