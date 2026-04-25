import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import AdminLayout from '@/pages/admin/AdminLayout';
import CeoLayout from '@/pages/ceo/CeoLayout';
import FinanceLayout from '@/pages/finance/FinanceLayout';
import EmployeeLayout from '@/pages/employee/EmployeeLayout';

const STALE_TIME = 1000 * 60 * 5;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: STALE_TIME, retry: 1 },
  },
});

const LandingPage = lazy(() => import('@/pages/LandingPage'));
const BookingPage = lazy(() => import('@/pages/BookingPage'));
const EventEnquiryPage = lazy(() => import('@/pages/EventEnquiryPage'));
const BookingTrackPage = lazy(() => import('@/pages/BookingTrackPage'));

const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const CeoDashboard = lazy(() => import('@/pages/ceo/CeoDashboard'));
const FinanceDashboard = lazy(() => import('@/pages/finance/FinanceDashboard'));
const EmployeeDashboard = lazy(() => import('@/pages/employee/EmployeeDashboard'));
const EmployeeLogsPlaceholder = lazy(() => import('@/pages/employee/EmployeeLogsPlaceholder'));
const MyTasksPage = lazy(() => import('@/pages/employee/MyTasksPage'));

const BookingsPage = lazy(() => import('@/pages/dashboard/BookingsPage'));
const FinancePage = lazy(() => import('@/pages/dashboard/FinancePage'));
const StaffPage = lazy(() => import('@/pages/dashboard/StaffPage'));
const InventoryPage = lazy(() => import('@/pages/dashboard/InventoryPage'));
const ReportsPage = lazy(() => import('@/pages/dashboard/ReportsPage'));
const CashFlow = lazy(() => import('@/pages/dashboard/CashFlow'));
const IncomeStatement = lazy(() => import('@/pages/dashboard/IncomeStatement'));
const BalanceSheet = lazy(() => import('@/pages/dashboard/BalanceSheet'));
const LedgerPage = lazy(() => import('@/pages/dashboard/LedgerPage'));
const RoomsPage = lazy(() => import('@/pages/dashboard/RoomsPage'));
const AuditPage = lazy(() => import('@/pages/dashboard/AuditPage'));
const TransactionsPage = lazy(() => import('@/pages/dashboard/TransactionsPage'));
const BookingPaymentsPage = lazy(() => import('@/pages/dashboard/BookingPaymentsPage'));
const QuotationsPage = lazy(() => import('@/pages/dashboard/QuotationsPage'));
const EnquiriesPage = lazy(() => import('@/pages/dashboard/EnquiriesPage'));
const ChartOfAccountsPage = lazy(() => import('@/pages/dashboard/ChartOfAccountsPage'));
const DebtorsPage = lazy(() => import('@/pages/dashboard/DebtorsPage'));
const SuppliersPage = lazy(() => import('@/pages/dashboard/SuppliersPage'));
const InvoicesPage = lazy(() => import('@/pages/dashboard/InvoicesPage'));
const RefundsPage = lazy(() => import('@/pages/dashboard/RefundsPage'));
const LogWorkPage = lazy(() => import('@/pages/dashboard/LogWorkPage'));
const PayslipsPage = lazy(() => import('@/pages/dashboard/PayslipsPage'));
const DashboardPlaceholder = lazy(() => import('@/components/DashboardPlaceholder'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500 text-sm">Loading…</p>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/booking" element={<BookingPage />} />
              <Route path="/event-enquiry" element={<EventEnquiryPage />} />
              <Route path="/booking-track" element={<BookingTrackPage />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Admin */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="bookings" element={<BookingsPage />} />
                <Route path="payments" element={<BookingPaymentsPage />} />
                <Route path="booking-payments" element={<Navigate to="payments" replace />} />
                <Route path="quotations" element={<QuotationsPage />} />
                <Route path="enquiries" element={<EnquiriesPage />} />
                <Route path="expenses" element={<TransactionsPage forcedType="expense" />} />
                <Route path="guest-bookings" element={<Navigate to="bookings?tab=guest" replace />} />
                <Route path="rooms" element={<RoomsPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="work-logs" element={<StaffPage />} />
                <Route path="salary" element={<Navigate to="../work-logs" replace />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit" element={<AuditPage />} />
              </Route>

              {/* CEO (read-only) */}
              <Route
                path="/ceo"
                element={
                  <ProtectedRoute allowedRoles={['ceo']}>
                    <CeoLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<CeoDashboard />} />
                <Route path="bookings" element={<BookingsPage />} />
                <Route path="expenses" element={<TransactionsPage forcedType="expense" />} />
                <Route path="finance" element={<FinancePage />} />
                <Route path="cashflow" element={<CashFlow />} />
                <Route path="income-statement" element={<IncomeStatement />} />
                <Route path="balance-sheet" element={<BalanceSheet />} />
                <Route path="ledger" element={<LedgerPage />} />
                <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
                <Route path="pl" element={<Navigate to="ledger" replace />} />
                <Route path="debtors" element={<DebtorsPage />} />
                <Route path="suppliers" element={<SuppliersPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="enquiries" element={<EnquiriesPage />} />
              </Route>

              {/* Finance */}
              <Route
                path="/finance"
                element={
                  <ProtectedRoute allowedRoles={['finance']}>
                    <FinanceLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<FinanceDashboard />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="expenses" element={<TransactionsPage forcedType="expense" />} />
                <Route path="payments" element={<BookingPaymentsPage />} />
                <Route path="booking-payments" element={<Navigate to="payments" replace />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="salary" element={<Navigate to="staff" replace />} />
                <Route path="suppliers" element={<SuppliersPage />} />
                <Route path="debtors" element={<DebtorsPage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="refunds" element={<RefundsPage />} />
                <Route path="cashflow" element={<CashFlow />} />
                <Route path="income-statement" element={<IncomeStatement />} />
                <Route path="balance-sheet" element={<BalanceSheet />} />
                <Route path="ledger" element={<LedgerPage />} />
                <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
                <Route path="pl" element={<Navigate to="ledger" replace />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="enquiries" element={<EnquiriesPage />} />
              </Route>

              {/* Employee */}
              <Route
                path="/employee"
                element={
                  <ProtectedRoute allowedRoles={['employee']}>
                    <EmployeeLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<EmployeeDashboard />} />
                <Route path="expenses" element={<TransactionsPage forcedType="expense" />} />
                <Route path="log-work" element={<LogWorkPage />} />
                <Route path="my-tasks" element={<MyTasksPage />} />
                <Route path="my-logs" element={<EmployeeLogsPlaceholder />} />
                <Route path="payslips" element={<PayslipsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
