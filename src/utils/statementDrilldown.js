import { TRANSACTION_CATEGORY_OPTIONS } from '@/constants/transactionCategories';
import { monthRange } from '@/utils/financePeriods';
import { getTransactionDebitCreditAccounts } from '@/utils/transactionLedgerUi';

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
 * Pull likely GL codes from a statement row key (e.g. salaries6001 → 6001).
 * Ignores lone 4-digit tokens in the 1900–2100 range so years are not treated as accounts.
 * @param {string | null | undefined} key
 * @returns {string[]}
 */
export function extractAccountCodesFromStatementLineKey(key) {
  if (key == null || key === '') return [];
  const s = String(key);
  const all = s.match(/\d{4,}/g) || [];
  if (all.length === 0) return [];
  const isYearToken = (x) => {
    const n = Number(x);
    return n >= 1900 && n <= 2100;
  };
  const nonYear = [...new Set(all.filter((x) => !isYearToken(x)))];
  if (nonYear.length) return nonYear;
  return [];
}

function normAcct(c) {
  return String(c ?? '').trim();
}

/**
 * @param {object} t - transaction row
 * @param {string[]} accountCodes - normalized codes from the statement line
 */
export function transactionTouchesAccountCodes(t, accountCodes) {
  if (!accountCodes?.length) return true;
  const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
  const d = normAcct(debitCode);
  const cr = normAcct(creditCode);
  return accountCodes.some((code) => {
    const x = normAcct(code);
    return Boolean(x) && (d === x || cr === x);
  });
}

/**
 * @param {object[]} rows
 * @param {{ type?: string | null, category?: string | null, accountCodes?: string[] | null }} filters
 */
export function filterTransactionsForDrilldown(rows, filters) {
  const { type, category, accountCodes } = filters;
  const acct = Array.isArray(accountCodes) ? accountCodes.map(normAcct).filter(Boolean) : [];
  const useAccount = acct.length > 0;

  return rows.filter((t) => {
    if (!useAccount && category && (t.category || '') !== category) return false;
    if (type && (t.type || '') !== type) return false;
    if (useAccount && !transactionTouchesAccountCodes(t, acct)) return false;
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
