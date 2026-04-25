/**
 * Canonical `category` values for POST/PUT /api/finance/transactions.
 * Known values should match backend mapping (e.g. transactionJournalService / ACCOUNTING.md on the API).
 * The transactions form also allows free text; see {@link resolveTransactionCategoryForApi}.
 * UI shows labels; API receives the `value` or a slugified custom string.
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

/** Slug for API when the user enters a category not in {@link TRANSACTION_CATEGORY_OPTIONS}. */
function slugifyCategoryInput(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/**
 * Map UI input (preset value, preset label, or free text) to the `category` string sent to the API.
 */
export function resolveTransactionCategoryForApi(rawInput) {
  const t = String(rawInput || '').trim();
  if (!t) return '';
  const tl = t.toLowerCase();
  const byValue = TRANSACTION_CATEGORY_OPTIONS.find((o) => o.value === tl);
  if (byValue) return byValue.value;
  const byLabel = TRANSACTION_CATEGORY_OPTIONS.find((o) => o.label.toLowerCase() === tl);
  if (byLabel) return byLabel.value;
  return slugifyCategoryInput(t);
}
