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
  /** Slug+hash keys embed words like "salary" — do not map those to parent 6000; use row `accountCodes` from helpers instead. */
  if (/^dbd_(inc|exp)_grp_/i.test(raw)) return [];

  if (/^cash_/.test(k) || /(net_change|opening|closing|beginning|ending)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  if (/(owners_contribution|owner.?s_contribution|capital_contribution)/.test(k)) return [DEFAULT_EQUITY_ACCOUNT];
  if (/(loan_proceeds|borrowing|proceeds_from_debt)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  if (/(repayment|dividend|redemption|buyback|distribution)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  /** Do not guess 4001/6000 — wrong code yields empty `GET .../transactions?accountCode=`. */
  if (
    !/^dbd_inc_grp_/i.test(raw) &&
    /(rental|revenue|income|deposit|advance|fee|other_income|admin)/.test(k) &&
    !/(paid|expense|cost|out|repayment|dividend_paid|contribution)/.test(k)
  ) {
    return [];
  }
  if (
    !/^dbd_exp_grp_/i.test(raw) &&
    /(paid|supplier|expense|utility|electricity|water|gas|wage|salary|maintenance|cleaning|fuel|charge|interest_paid|tax)/.test(k)
  ) {
    return [];
  }
  if (/(purchase|equipment|building|loan|invest|disposal|sale_of)/.test(k)) return [DEFAULT_CASH_ACCOUNT];
  return [DEFAULT_CASH_ACCOUNT];
}

/**
 * GL codes for cash-flow **summary** drills (operating totals, net change, etc.):
 * union from "Cash &amp; cash equivalents" rows in the visible months (e.g. `10901`), not a hardcoded `1001`.
 * Falls back to {@link DEFAULT_CASH_ACCOUNT} only when the statement exposes no cash lines/codes.
 * @param {Record<number, { key?: string, accountCodes?: string[] }[]> | null | undefined} cashAccountsByMonth
 * @param {number[]} visibleMonths
 * @returns {string[]}
 */
export function cashflowCashSectionAccountCodesUnion(cashAccountsByMonth, visibleMonths) {
  const s = new Set();
  for (const mi of visibleMonths || []) {
    const rows = cashAccountsByMonth?.[mi];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      (r?.accountCodes || []).forEach((c) => {
        const t = String(c).trim();
        if (t) s.add(t);
      });
      const raw = String(r?.key ?? '');
      const m = raw.match(/^cashAcc_(.+)$/i);
      if (m && /^\d+$/.test(String(m[1]).trim())) s.add(String(m[1]).trim());
    }
  }
  const merged = [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return merged.length ? merged : [DEFAULT_CASH_ACCOUNT];
}

/** @deprecated Use {@link cashflowCashSectionAccountCodesUnion} with `cashAccountsByMonth` + `visibleMonths` from the page. */
export function cashflowSummaryCashAccountCodes() {
  return [DEFAULT_CASH_ACCOUNT];
}

/**
 * Shared drill logic (same as cash flow): union `accountCodes` from rows across months, then key-based fallback.
 * @param {Record<number, object[]> | null | undefined} rowsByMonth
 * @param {string | null | undefined} lineKey
 * @param {number | null} monthIndex
 * @param {number[]} visibleMonths
 * @param {boolean} unionAcrossMonths
 * @param {(key: string | null | undefined) => string[]} fallbackKeyToCodes
 * @param {(rows: object[] | null | undefined, key: string) => object | null | undefined} findRowInMonth
 */
export function statementRowsDrillAccountCodes(
  rowsByMonth,
  lineKey,
  monthIndex,
  visibleMonths,
  unionAcrossMonths,
  fallbackKeyToCodes,
  findRowInMonth
) {
  if (!rowsByMonth || lineKey == null || lineKey === '') {
    return fallbackKeyToCodes(lineKey);
  }
  if (unionAcrossMonths && Array.isArray(visibleMonths) && visibleMonths.length) {
    const s = new Set();
    for (const mi of visibleMonths) {
      const row = findRowInMonth(rowsByMonth[mi], String(lineKey));
      (row?.accountCodes || []).forEach((c) => {
        const t = String(c).trim();
        if (t) s.add(t);
      });
    }
    const merged = [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (merged.length) return merged;
  } else if (monthIndex != null) {
    const row = findRowInMonth(rowsByMonth[monthIndex], String(lineKey));
    if (row?.accountCodes?.length) return row.accountCodes;
  }
  return fallbackKeyToCodes(lineKey);
}

/**
 * Prefer GL codes attached to cash-flow statement rows (from API breakdown); otherwise {@link cashflowStatementLineAccountCodes}.
 * @param {Record<number, { key: string, accountCodes?: string[] }[]> | null | undefined} rowsByMonth
 * @param {string} key - row key
 * @param {number | null} monthIndex - month index for a single cell, or null when using union
 * @param {number[]} visibleMonths - month indices in view (for union)
 * @param {boolean} unionAcrossMonths - when true, merge `accountCodes` from the row in every visible month
 */
export function cashflowDrillAccountCodes(rowsByMonth, key, monthIndex, visibleMonths, unionAcrossMonths) {
  return statementRowsDrillAccountCodes(
    rowsByMonth,
    key,
    monthIndex,
    visibleMonths,
    unionAcrossMonths,
    cashflowStatementLineAccountCodes,
    (rows, k) => rows?.find((r) => r.key === k) ?? null
  );
}

/**
 * P&amp;L row key → GL for transaction drill when the key has no embedded account digits.
 * @param {string | null | undefined} key
 * @param {'income' | 'expense'} [_section] - reserved for callers; fallbacks no longer use section-specific default GLs.
 * @returns {string[]}
 */
export function incomeStatementLineAccountCodes(key, _section) {
  const fromDigits = extractAccountCodesFromStatementLineKey(key);
  if (fromDigits.length) return fromDigits;
  const raw = String(key ?? '').trim();
  /** Same slug keys as cash-flow detailed groups — do not guess parent 4001/6000. */
  if (/^dbd_(inc|exp)_grp_/i.test(raw)) return [];
  if (/^\d{3,}$/.test(raw)) return [raw];
  /** No embedded GL — do not default to 6000/4001 (often wrong; API returns zero rows). */
  return [];
}

/** Stable row key for P&amp;L tables (must match {@link IncomeStatement} row matching). */
export function incomeStatementRowKey(row, index, prefix) {
  return String(
    row?.key ??
    row?.code ??
    row?.accountCode ??
    row?.name ??
    row?.label ??
    row?.category ??
    row?.description ??
    `${prefix}_${index}`
  );
}

/**
 * Same visibility rule as cash-flow detail tables: line appears if any visible month has a non-zero amount.
 * @param {string[]} keys
 * @param {Record<number, object[]>} rowsByMonth
 * @param {number[]} visibleMonths
 * @param {boolean[]} monthHasData
 * @param {'income' | 'expense'} section
 */
export function incomeStatementKeysWithAnyActivity(keys, rowsByMonth, visibleMonths, monthHasData, section) {
  const prefix = String(section || '').toLowerCase() === 'expense' ? 'expense' : 'income';
  return keys.filter((k) =>
    visibleMonths.some((mi) => {
      if (!monthHasData[mi]) return false;
      const rows = rowsByMonth[mi];
      if (!Array.isArray(rows)) return false;
      const row = rows.find((r, i) => incomeStatementRowKey(r, i, prefix) === k);
      const v = row?.amount ?? row?.value ?? row?.total;
      if (v == null || v === '') return false;
      const n = Number(v);
      return !Number.isNaN(n) && Math.abs(n) > 1e-9;
    })
  );
}

/**
 * Prefer GL codes on income-statement rows from the API; otherwise {@link incomeStatementLineAccountCodes}.
 * Uses the same algorithm as {@link cashflowDrillAccountCodes} via {@link statementRowsDrillAccountCodes}.
 * @param {Record<number, object[]> | null | undefined} rowsByMonth
 * @param {string} key
 * @param {'income' | 'expense'} section
 * @param {number | null} monthIndex
 * @param {number[]} visibleMonths
 * @param {boolean} unionAcrossMonths
 */
export function incomeStatementDrillAccountCodes(
  rowsByMonth,
  key,
  section,
  monthIndex,
  visibleMonths,
  unionAcrossMonths
) {
  const plSec = String(section || '').toLowerCase() === 'expense' ? 'expense' : 'income';
  const prefix = plSec === 'expense' ? 'expense' : 'income';
  return statementRowsDrillAccountCodes(
    rowsByMonth,
    key,
    monthIndex,
    visibleMonths,
    unionAcrossMonths,
    (k) => incomeStatementLineAccountCodes(k, plSec),
    (rows, k) => rows?.find((r, i) => incomeStatementRowKey(r, i, prefix) === k) ?? null
  );
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
  if (/^\d{3,}$/.test(c)) return [c];
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

  const typeNorm = type ? String(type).toLowerCase() : '';
  return rows.filter((t) => {
    if (!useAccount && category && (t.category || '') !== category) return false;
    /** GL-scoped drill: account match is authoritative (cf. cash-flow); root `type` can drop valid journal sides. */
    if (!useAccount && typeNorm && String(t.type || '').toLowerCase() !== typeNorm) return false;
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
