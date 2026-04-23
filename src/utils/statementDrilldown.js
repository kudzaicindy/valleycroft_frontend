import { TRANSACTION_CATEGORY_OPTIONS } from '@/constants/transactionCategories';
import { monthRange } from '@/utils/financePeriods';
import { collectTransactionSurfaceAccountCodes } from '@/utils/transactionLedgerUi';

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

/** Default GL when API keys do not embed a code (align with typical ValleyCroft seed). */
const DEFAULT_CASH_ACCOUNT = '1001';
const DEFAULT_REVENUE_ACCOUNT = '4001';
const DEFAULT_OPEX_ACCOUNT = '6000';
const DEFAULT_EQUITY_ACCOUNT = '3000';

/**
 * GL code(s) to drill for a cash-flow detail row so `GET /api/finance/transactions?accountCode=` can filter.
 * Uses embedded digits in the key, `cashAcc_*` rows, then name heuristics; falls back to cash account.
 * @param {string | null | undefined} key
 * @returns {string[]}
 */
export function cashflowStatementLineAccountCodes(key) {
  const fromDigits = extractAccountCodesFromStatementLineKey(key);
  if (fromDigits.length) return fromDigits;
  const raw = String(key || '');
  const cashAcc = raw.match(/^cashAcc_(.+)$/i);
  if (cashAcc && /^\d+$/.test(String(cashAcc[1]).trim())) return [String(cashAcc[1]).trim()];

  const k = raw.toLowerCase();
  if (/^cash_/.test(k) || /(net_change|opening|closing|beginning|ending)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  if (/(owners_contribution|owner.?s_contribution|capital_contribution)/.test(k)) return [DEFAULT_EQUITY_ACCOUNT];
  if (/(loan_proceeds|borrowing|proceeds_from_debt)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  if (/(repayment|dividend|redemption|buyback|distribution)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  if (
    /(rental|revenue|income|deposit|advance|fee|other_income|admin)/.test(k) &&
    !/(paid|expense|cost|out|repayment|dividend_paid|contribution)/.test(k)
  ) {
    return [DEFAULT_REVENUE_ACCOUNT];
  }
  if (
    /(paid|supplier|expense|utility|electricity|water|gas|wage|salary|maintenance|cleaning|fuel|charge|interest_paid|tax)/.test(k)
  ) {
    return [DEFAULT_OPEX_ACCOUNT];
  }
  if (/(purchase|equipment|building|loan|invest|disposal|sale_of)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  return [DEFAULT_CASH_ACCOUNT];
}

/** Subtotals / net cash / net change — show primary cash account activity for the period. */
export function cashflowSummaryCashAccountCodes() {
  return [DEFAULT_CASH_ACCOUNT];
}

/**
 * P&amp;L row key → GL for transaction drill when the key has no embedded account digits.
 * @param {string | null | undefined} key
 * @param {'income' | 'expense'} section
 * @returns {string[]}
 */
export function incomeStatementLineAccountCodes(key, section) {
  const fromDigits = extractAccountCodesFromStatementLineKey(key);
  if (fromDigits.length) return fromDigits;
  const raw = String(key ?? '').trim();
  if (/^\d{4,}$/.test(raw)) return [raw];
  const sec = String(section || '').toLowerCase();
  if (sec === 'expense') return [DEFAULT_OPEX_ACCOUNT];
  if (sec === 'income') return [DEFAULT_REVENUE_ACCOUNT];
  return [];
}

/**
 * Balance sheet detail row → GL codes for drill (skips synthetic subtotal rows).
 * @param {object | null | undefined} row
 * @returns {string[]}
 */
export function balanceSheetLineAccountCodes(row) {
  if (!row || typeof row !== 'object' || row._bsSubtotal) return [];
  const c = String(row.accountCode ?? row.code ?? '').trim();
  if (!c) return [];
  const fromDigits = extractAccountCodesFromStatementLineKey(c);
  if (fromDigits.length) return fromDigits;
  if (/^\d{4,}$/.test(c)) return [c];
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
  const want = new Set(accountCodes.map(normAcct).filter(Boolean));
  if (!want.size) return true;

  return collectTransactionSurfaceAccountCodes(t).some((c) => want.has(normAcct(c)));
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
