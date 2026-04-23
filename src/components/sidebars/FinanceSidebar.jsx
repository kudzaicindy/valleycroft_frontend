import {
  FaBalanceScale,
  FaBook,
  FaChartBar,
  FaChartLine,
  FaCreditCard,
  FaFileAlt,
  FaHistory,
  FaMoneyBillWave,
  FaTruck,
  FaUserClock,
} from 'react-icons/fa';
import PortalSidebar from '@/components/sidebars/PortalSidebar';

const sections = [
  {
    id: 'main',
    label: 'Main',
    collapsible: false,
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/finance/dashboard', icon: <FaChartBar className="w-4 h-4" /> },
      { id: 'transactions', label: 'Transactions', path: '/finance/transactions', icon: <FaCreditCard className="w-4 h-4" /> },
      { id: 'payments', label: 'Payments', path: '/finance/payments', icon: <FaMoneyBillWave className="w-4 h-4" /> },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    defaultOpen: true,
    items: [
      { id: 'salary', label: 'Worker payments', path: '/finance/salary', icon: <FaMoneyBillWave className="w-4 h-4" /> },
      { id: 'suppliers', label: 'Suppliers', path: '/finance/suppliers', icon: <FaTruck className="w-4 h-4" /> },
      { id: 'debtors', label: 'Debtors', path: '/finance/debtors', icon: <FaUserClock className="w-4 h-4" /> },
      { id: 'invoices', label: 'Invoices', path: '/finance/invoices', icon: <FaFileAlt className="w-4 h-4" /> },
      { id: 'refunds', label: 'Refunds', path: '/finance/refunds', icon: <FaHistory className="w-4 h-4" /> },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    defaultOpen: true,
    items: [
      { id: 'cashflow', label: 'Cash Flow', path: '/finance/cashflow', icon: <FaChartLine className="w-4 h-4" /> },
      { id: 'income-statement', label: 'Income Statement', path: '/finance/income-statement', icon: <FaChartLine className="w-4 h-4" /> },
      { id: 'balance-sheet', label: 'Balance Sheet', path: '/finance/balance-sheet', icon: <FaBalanceScale className="w-4 h-4" /> },
      { id: 'chart-of-accounts', label: 'Chart of Accounts', path: '/finance/chart-of-accounts', icon: <FaFileAlt className="w-4 h-4" /> },
      { id: 'ledger', label: 'Ledger', path: '/finance/ledger', icon: <FaBook className="w-4 h-4" /> },
      { id: 'audit', label: 'Audit Trail', path: '/finance/audit', icon: <FaHistory className="w-4 h-4" /> },
    ],
  },
];

export default function FinanceSidebar({ onLogout }) {
  return (
    <PortalSidebar
      portalLabel="Finance Portal"
      profileName="Peter van Rooyen"
      profileRole="Finance Manager"
      sections={sections}
      onLogout={onLogout}
    />
  );
}
