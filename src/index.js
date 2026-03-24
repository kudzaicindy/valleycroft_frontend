// src/components/finance/index.js
// Central export — import from here across the project

export { default as IncomeStatement } from './IncomeStatement';
export { default as BalanceSheet }    from './BalanceSheet';
export { default as CashFlow }        from './CashFlow';
export { default as Ledger }         from './Ledger';

// Shared utilities — re-exported for convenience
export {
  useFinanceQuery,
  DateRangePicker,
  PeriodSelector,
  KpiCard,
  StatementTable,
  SectionHead,
  DataRow,
  TableHeader,
  StatementToolbar,
  LoadingState,
  ErrorState,
  EmptyState,
  fmtCurrency,
  getDefaultDates,
} from './shared';
