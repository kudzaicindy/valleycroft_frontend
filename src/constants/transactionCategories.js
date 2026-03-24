/**
 * Canonical `category` values for POST/PUT /api/finance/transactions.
 * Must match backend mapping (e.g. transactionJournalService / ACCOUNTING.md on the API).
 * UI shows labels; API receives the `value`.
 */
export const TRANSACTION_CATEGORY_OPTIONS = [
  { value: 'booking', label: 'Booking revenue' },
  { value: 'event', label: 'Event revenue' },
  { value: 'refund', label: 'Refund' },
  { value: 'salary', label: 'Salary & wages' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'supplier', label: 'Supplier / vendor' },
  { value: 'maintenance', label: 'Maintenance & repairs' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'transport', label: 'Transport & travel' },
  { value: 'bank_fees', label: 'Bank fees' },
  { value: 'professional_fees', label: 'Professional fees' },
  { value: 'other', label: 'Other' },
];

const LABEL_BY_VALUE = Object.fromEntries(
  TRANSACTION_CATEGORY_OPTIONS.map((o) => [o.value, o.label])
);

/** Display label for a stored category; falls back to raw string. */
export function transactionCategoryLabel(canonical) {
  if (canonical == null || canonical === '') return '—';
  return LABEL_BY_VALUE[canonical] ?? canonical;
}
