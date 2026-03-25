/**
 * Role-based nav config for ValleyCroft dashboard.
 * path is relative to basePath (e.g. basePath /admin + path 'dashboard' = /admin/dashboard).
 */

export const dashboardNavConfig = {
  admin: {
    name: 'Nomsa Dlamini',
    role: 'Operations Administrator',
    badge: 'ADMIN',
    initials: 'ND',
    sections: [
      { label: 'Overview', items: [{ icon: 'fas fa-th-large', label: 'Dashboard', path: 'dashboard' }] },
      {
        label: 'Bookings & Rooms',
        items: [
          { icon: 'fas fa-calendar-check', label: 'Bookings', path: 'bookings' },
          { icon: 'fas fa-bed', label: 'Rooms', path: 'rooms' },
        ],
      },
      {
        label: 'People & Pay',
        items: [
          { icon: 'fas fa-users', label: 'Staff', path: 'staff' },
          { icon: 'fas fa-tasks', label: 'Work Logs & Assignments', path: 'work-logs' },
        ],
      },
      {
        label: 'Operations',
        items: [
          { icon: 'fas fa-boxes', label: 'Inventory', path: 'inventory' },
          { icon: 'fas fa-chart-bar', label: 'Reports', path: 'reports' },
          { icon: 'fas fa-history', label: 'Audit', path: 'audit' },
        ],
      },
    ],
  },
  finance: {
    name: 'Peter van Rooyen',
    role: 'Finance Manager',
    badge: 'FINANCE',
    initials: 'PV',
    sections: [
      { label: 'Overview', items: [{ icon: 'fas fa-th-large', label: 'Dashboard', path: 'dashboard' }] },
      {
        label: 'Transactions & Pay',
        items: [
          { icon: 'fas fa-exchange-alt', label: 'Transactions', path: 'transactions' },
          { icon: 'fas fa-hand-holding-usd', label: 'Booking payments', path: 'booking-payments' },
          { icon: 'fas fa-money-bill-wave', label: 'Salary', path: 'salary' },
        ],
      },
      {
        label: 'Parties',
        items: [
          { icon: 'fas fa-truck', label: 'Suppliers', path: 'suppliers' },
          { icon: 'fas fa-user-clock', label: 'Debtors', path: 'debtors' },
        ],
      },
      {
        label: 'Documents',
        items: [
          { icon: 'fas fa-file-invoice', label: 'Invoices', path: 'invoices' },
          { icon: 'fas fa-undo', label: 'Refunds', path: 'refunds' },
        ],
      },
      {
        label: 'Statements (transaction-based)',
        items: [
          { icon: 'fas fa-water', label: 'Cash Flow', path: 'cashflow' },
          { icon: 'fas fa-chart-line', label: 'Income Statement', path: 'income-statement' },
          { icon: 'fas fa-balance-scale', label: 'Balance Sheet', path: 'balance-sheet' },
        ],
      },
      {
        label: 'Accounting (ledger)',
        items: [
          { icon: 'fas fa-list-alt', label: 'Chart of accounts', path: 'chart-of-accounts' },
          { icon: 'fas fa-book', label: 'Ledger', path: 'ledger' },
        ],
      },
      { label: 'Audit', items: [{ icon: 'fas fa-history', label: 'Audit Trail', path: 'audit' }] },
    ],
  },
  ceo: {
    name: 'Catherine Watkins',
    role: 'Chief Executive Officer',
    badge: 'CEO',
    initials: 'CW',
    sections: [
      { label: 'Overview', items: [{ icon: 'fas fa-th-large', label: 'Dashboard', path: 'dashboard' }] },
      {
        label: 'Operations (read-only)',
        items: [
          { icon: 'fas fa-calendar-check', label: 'Bookings', path: 'bookings' },
          { icon: 'fas fa-calculator', label: 'Finance', path: 'finance' },
        ],
      },
      {
        label: 'Statements (transaction-based)',
        items: [
          { icon: 'fas fa-water', label: 'Cash Flow', path: 'cashflow' },
          { icon: 'fas fa-chart-line', label: 'Income Statement', path: 'income-statement' },
          { icon: 'fas fa-balance-scale', label: 'Balance Sheet', path: 'balance-sheet' },
        ],
      },
      {
        label: 'Accounting (ledger)',
        items: [
          { icon: 'fas fa-list-alt', label: 'Chart of accounts', path: 'chart-of-accounts' },
          { icon: 'fas fa-book', label: 'Ledger', path: 'ledger' },
        ],
      },
      {
        label: 'Parties & People',
        items: [
          { icon: 'fas fa-user-clock', label: 'Debtors', path: 'debtors' },
          { icon: 'fas fa-truck', label: 'Suppliers', path: 'suppliers' },
          { icon: 'fas fa-users', label: 'Staff', path: 'staff' },
        ],
      },
      {
        label: 'Insights',
        items: [
          { icon: 'fas fa-chart-bar', label: 'Reports', path: 'reports' },
          { icon: 'fas fa-history', label: 'Audit', path: 'audit' },
        ],
      },
    ],
  },
  employee: {
    name: 'Thandi Moyo',
    role: 'Head Housekeeper',
    badge: 'STAFF',
    initials: 'TM',
    sections: [
      { label: 'My Workspace', items: [{ icon: 'fas fa-home', label: 'Dashboard', path: 'dashboard' }] },
      {
        label: 'Work & Pay',
        items: [
          { icon: 'fas fa-tasks', label: 'My Tasks', path: 'my-tasks' },
          { icon: 'fas fa-pen-fancy', label: 'Log Work', path: 'log-work' },
          { icon: 'fas fa-list', label: 'My Logs', path: 'my-logs' },
          { icon: 'fas fa-file-invoice-dollar', label: 'Payslips', path: 'payslips' },
        ],
      },
    ],
  },
};

/** Topbar title by role and path segment. */
const pageTitlesByRole = {
  admin: {
    dashboard: "Admin Dashboard",
    bookings: "Reservations",
    rooms: "Rooms",
    staff: "Staff",
    'work-logs': "Work Logs & Assignments",
    inventory: "Inventory",
    reports: "Reports",
    audit: "Audit Trail",
  },
  finance: {
    dashboard: "Finance Dashboard",
    transactions: "Transactions",
    salary: "Salary",
    suppliers: "Suppliers",
    debtors: "Debtors",
    invoices: "Invoices",
    refunds: "Refunds",
    cashflow: "Cash Flow",
    'income-statement': "Income Statement",
    'balance-sheet': "Balance Sheet",
    ledger: "Ledger",
    'chart-of-accounts': "Chart of accounts",
    audit: "Audit Trail",
  },
  ceo: {
    dashboard: "CEO Dashboard",
    bookings: "Reservations",
    finance: "Financial Summary",
    cashflow: "Cash Flow",
    'income-statement': "Income Statement",
    'balance-sheet': "Balance Sheet",
    ledger: "Ledger",
    'chart-of-accounts': "Chart of accounts",
    debtors: "Debtors",
    suppliers: "Suppliers",
    staff: "Staff",
    reports: "Reports",
    audit: "Audit Trail",
  },
  employee: {
    dashboard: "My Dashboard",
    'log-work': "Log Work",
    'my-logs': "My Logs",
    payslips: "Payslips",
  },
};

/** Short description for placeholder pages (optional). */
export const pageDescriptions = {
  admin: {
    dashboard: "Today's bookings, low stock alerts, guest booking requests, staff on duty",
    bookings: "Internal reservations, website booking requests, and room availability — all in one place",
    rooms: "Manage room listings, photos, availability toggle",
    staff: "Employee list, add employee, assign tasks, view work logs",
    'work-logs': "View each staff member's work logs and assign tasks",
    inventory: "Stock levels, reorder alerts, equipment register",
    reports: "Generate and download reports",
    audit: "Full audit trail — all users and actions",
  },
  finance: {
    dashboard: "Income vs expense summary, month-to-date totals",
    transactions: "Add income/expense, view and filter all entries",
    'booking-payments': "Record guest payments for confirmed bookings as finance transactions",
    salary: "Record salary payments, filter by employee or month",
    suppliers: "Supplier list, add payment, payment history per supplier",
    debtors: "Outstanding debtors, mark partial/paid, aging summary",
    invoices: "Create invoice, change status, download PDF",
    refunds: "Record refunds as finance transactions (posted to Transactions)",
    cashflow: "Cash flow statement with date range filter",
    'income-statement': "Income statement broken down by revenue stream",
    'balance-sheet': "Balance sheet view",
    ledger: "Ledger operating summary, balance sheet, cash flow, journals",
    'chart-of-accounts': "GL accounts and transaction activity per account",
    audit: "Audit trail filtered to finance-relevant actions",
  },
  ceo: {
    dashboard: "Full business overview: revenue, occupancy, headcount, alerts",
    bookings: "Read-only bookings view",
    finance: "Financial summary with all statements",
    cashflow: "Cash flow statement with date range",
    'income-statement': "Income statement by period",
    'balance-sheet': "Balance sheet snapshot",
    ledger: "Ledger reports and journal entries from /api/accounting",
    'chart-of-accounts': "GL accounts and activity (read-only)",
    debtors: "Debtors summary with aging",
    suppliers: "Supplier payment summary",
    staff: "Read-only staff profiles and work logs",
    reports: "Access all reports, download PDFs",
    audit: "Full audit trail, read-only",
  },
  employee: {
    dashboard: "Tasks assigned to me, pending submissions",
    'log-work': "Form to submit daily/weekly work log and photo upload",
    'my-tasks': "Assignments from admin — view and link when logging work",
    'my-logs': "History of my own past work log submissions",
    payslips: "View own salary payment history",
  },
};

export function getPageTitle(role, pathSegment) {
  const seg = (pathSegment ?? '').toString().split('/')[0] || 'dashboard';
  const byRole = pageTitlesByRole[role];
  if (byRole && byRole[seg]) return byRole[seg];
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getPageDescription(role, pathSegment) {
  const seg = (pathSegment ?? '').toString().split('/')[0] || 'dashboard';
  const byRole = pageDescriptions[role];
  return (byRole && byRole[seg]) || '';
}
