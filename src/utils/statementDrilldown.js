import { TRANSACTION_CATEGORY_OPTIONS } from '@/constants/transactionCategories';
import { monthRange } from '@/utils/financePeriods';

const KNOWN_CATEGORY = new Set(TRANSACTION_CATEGORY_OPTIONS.map((o) => o.value));

/**
 * Map a statement line key (cashflow / income statement) to a transaction `category` when possible.
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
export function statementKeyToTransactionCategory(key) {
  if (key == null || key === '') return null;
  const s = String(key);
  if (KNOWN_CATEGORY.has(s)) return s;
  for (const prefix of ['cashIn_', 'cashOut_', 'cogs_', 'opex_']) {
    if (s.startsWith(prefix)) {
      const rest = s.slice(prefix.length);
      if (KNOWN_CATEGORY.has(rest)) return rest;
    }
  }
  const u = s.lastIndexOf('_');
  if (u !== -1) {
    const tail = s.slice(u + 1);
    if (KNOWN_CATEGORY.has(tail)) return tail;
  }
  return null;
}

/** First day of first month through last day of last month (month indices 0–11). */
export function mergedMonthRange(year, monthIndexes) {
  if (!monthIndexes || monthIndexes.length === 0) return null;
  const sorted = [...monthIndexes].sort((a, b) => a - b);
  const { start } = monthRange(year, sorted[0]);
  const { end } = monthRange(year, sorted[sorted.length - 1]);
  return { start, end };
}

/**
 * @param {object[]} rows
 * @param {{ type?: string | null, category?: string | null }} filters
 */
export function filterTransactionsForDrilldown(rows, filters) {
  const { type, category } = filters;
  return rows.filter((t) => {
    if (category && (t.category || '') !== category) return false;
    if (type && (t.type || '') !== type) return false;
    return true;
  });
}

/** Sum of absolute amounts (matches typical statement line totals). */
export function sumTransactionAbsAmounts(rows) {
  return rows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
}

/** Net effect: income positive, expense negative (for net income / net cash style lines). */
export function sumTransactionNetEffect(rows) {
  return rows.reduce((s, t) => {
    const n = Math.abs(Number(t.amount) || 0);
    if (t.type === 'expense') return s - n;
    return s + n;
  }, 0);
}
