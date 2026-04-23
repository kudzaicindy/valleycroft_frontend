import { getJournalLineAccountCode, getJournalLineDebitCredit } from '@/utils/coaLedgerMerge';

/** When API omits `revenueAccountCode` on accrual booking income, pair receivable debit with typical room-revenue GL (ValleyCroft seed). */
const INFERRED_ACCRUAL_BOOKING_REVENUE_CODE = '4001';

/** Unique key per intentional POST — server dedupes duplicate submits with the same header. */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Prefer `ledgerStatus` from API; fall back to `journalEntryId` for older payloads. */
export function isTransactionLedgerPosted(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.ledgerStatus === 'posted') return true;
  if (row.ledgerStatus === 'unposted') return false;
  return Boolean(row.journalEntryId);
}

/** Debit / credit / net for one transaction row (matches Transactions table logic). */
export function getTransactionRowDebitCreditNet(t) {
  if (!t || typeof t !== 'object') {
    return { rowDebit: 0, rowCredit: 0, rowNet: 0 };
  }
  const refundLike = t.category === 'refund';
  const rowDebit = refundLike
    ? Number(t.debit ?? t.amount) || 0
    : Number(t.debit ?? (t.type === 'expense' ? t.amount : 0)) || 0;
  const rowCredit = refundLike
    ? Number(t.credit ?? t.amount) || 0
    : Number(t.credit ?? (t.type === 'income' ? t.amount : 0)) || 0;
  const rowNet = t.net != null ? Number(t.net) || 0 : rowCredit - rowDebit;
  return { rowDebit, rowCredit, rowNet };
}

function journalLineAccountName(j) {
  if (!j || typeof j !== 'object') return '';
  const acc = j.account ?? j.glAccount ?? j.gl_account;
  if (acc && typeof acc === 'object') {
    const n = acc.name ?? acc.accountName ?? acc.account_name ?? acc.label;
    if (n != null && String(n).trim()) return String(n).trim();
  }
  return String(j.accountName ?? j.account_name ?? j.accountTitle ?? j.account_title ?? '').trim();
}

function pickAcct(v) {
  return String(v ?? '').trim();
}

/**
 * GL codes the API may expose on the transaction root when `lines` is empty (accrual bookings, etc.).
 * @param {object} t
 * @returns {string[]}
 */
function transactionRootExtraAccountCodes(t) {
  if (!t || typeof t !== 'object') return [];
  const keys = [
    t.receivableAccountCode,
    t.receivable_account_code,
    t.revenueAccountCode,
    t.revenue_account_code,
    t.cashAccountCode,
    t.cash_account_code,
    t.bankAccountCode,
    t.bank_account_code,
    t.expenseAccountCode,
    t.expense_account_code,
    t.payableAccountCode,
    t.payable_account_code,
    t.liabilityAccountCode,
    t.liability_account_code,
    t.assetAccountCode,
    t.asset_account_code,
  ];
  return [...new Set(keys.map(pickAcct).filter(Boolean))];
}

/**
 * Ledger account codes + optional display names from API (camelCase or snake_case).
 * When the API puts monetary amounts in `debit` / `credit` but GL codes on `lines`, derives the
 * strongest debit line and strongest credit line for display and client-side account checks.
 */
export function getTransactionDebitCreditAccounts(t) {
  if (!t || typeof t !== 'object') {
    return { debitCode: '', creditCode: '', debitName: '', creditName: '' };
  }
  let debitCode = String(
    t.debitAccount ?? t.debitAccountCode ?? t.accountDebited ?? t.debitedAccountCode ?? t.debit_account ?? ''
  ).trim();
  let creditCode = String(
    t.creditAccount ?? t.creditAccountCode ?? t.accountCredited ?? t.creditedAccountCode ?? t.credit_account ?? ''
  ).trim();
  let debitName = String(
    t.debitAccountName ?? t.debit_account_name ?? t.debitedAccountName ?? t.debited_account_name ?? ''
  ).trim();
  let creditName = String(
    t.creditAccountName ?? t.credit_account_name ?? t.creditedAccountName ?? t.credited_account_name ?? ''
  ).trim();

  const lines = t.lines ?? t.journalLines ?? t.ledgerLines;
  if (Array.isArray(lines) && lines.length > 0) {
    let bestDebit = { code: '', name: '', amt: -1 };
    let bestCredit = { code: '', name: '', amt: -1 };
    for (const line of lines) {
      const code = getJournalLineAccountCode(line);
      if (!code) continue;
      const { debit, credit } = getJournalLineDebitCredit(line);
      const nm = journalLineAccountName(line);
      if (debit > 0 && debit > bestDebit.amt) bestDebit = { code, name: nm, amt: debit };
      if (credit > 0 && credit > bestCredit.amt) bestCredit = { code, name: nm, amt: credit };
    }
    if (!debitCode && bestDebit.code) {
      debitCode = bestDebit.code;
      if (!debitName && bestDebit.name) debitName = bestDebit.name;
    }
    if (!creditCode && bestCredit.code) {
      creditCode = bestCredit.code;
      if (!creditName && bestCredit.name) creditName = bestCredit.name;
    }
  }

  const recv = pickAcct(t.receivableAccountCode ?? t.receivable_account_code);
  const rev = pickAcct(t.revenueAccountCode ?? t.revenue_account_code);
  const cashC = pickAcct(
    t.cashAccountCode ?? t.cash_account_code ?? t.bankAccountCode ?? t.bank_account_code
  );
  const expAcct = pickAcct(t.expenseAccountCode ?? t.expense_account_code);
  const payAcct = pickAcct(t.payableAccountCode ?? t.payable_account_code);

  const ty = String(t.type || '').toLowerCase();
  if (ty === 'income') {
    const cat = String(t.category || '').toLowerCase();
    const src = String(t.source || '').toLowerCase();
    const isCashReceipt = cat === 'booking_payment' || src.includes('debtor_payment');

    if (isCashReceipt && cashC && recv) {
      debitCode = cashC;
      creditCode = recv;
    } else if (isCashReceipt && cashC && !recv) {
      if (!debitCode) debitCode = cashC;
      if (!creditCode && rev) creditCode = rev;
    } else {
      if (!debitCode) {
        if (recv) debitCode = recv;
        else if (cashC) debitCode = cashC;
      }
      if (!creditCode && rev) creditCode = rev;
    }
  } else if (ty === 'expense') {
    if (!debitCode && expAcct) debitCode = expAcct;
    if (!creditCode) {
      if (cashC) creditCode = cashC;
      else if (payAcct) creditCode = payAcct;
    }
  }

  if (ty === 'income' && recv && !pickAcct(creditCode)) {
    const rr = String(t.revenueRecognition ?? '').toLowerCase();
    const cat = String(t.category || '').toLowerCase();
    const src = String(t.source || '').toLowerCase();
    if (rr.includes('accrual') || cat === 'booking' || src.includes('guest_booking')) {
      creditCode = rev || INFERRED_ACCRUAL_BOOKING_REVENUE_CODE;
    }
  }

  return { debitCode, creditCode, debitName, creditName };
}

/**
 * All GL codes on this row that should match `accountCode` filters / drill-down (lines + debit/credit + root hints).
 * @param {object | null | undefined} t
 * @returns {string[]}
 */
export function collectTransactionSurfaceAccountCodes(t) {
  if (!t || typeof t !== 'object') return [];
  const codes = new Set();
  const add = (x) => {
    const s = pickAcct(x);
    if (s) codes.add(s);
  };
  const lines = t.lines ?? t.journalLines ?? t.ledgerLines;
  if (Array.isArray(lines)) {
    for (const line of lines) add(getJournalLineAccountCode(line));
  }
  const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
  add(debitCode);
  add(creditCode);
  for (const c of transactionRootExtraAccountCodes(t)) add(c);
  return [...codes];
}

function isCreditNormalAccountCode(code) {
  const c = pickAcct(code).charAt(0);
  return c === '3' || c === '4' || c === '5';
}

/**
 * Debit / credit column amounts for the statement drill table when the API uses one-sided `debit`/`credit` money fields.
 */
export function inferStatementDrillDisplayAmounts(t) {
  if (!t || typeof t !== 'object') return { displayDebit: 0, displayCredit: 0 };
  const lines = t.lines ?? t.journalLines ?? t.ledgerLines;
  if (Array.isArray(lines) && lines.length > 0) {
    let d = 0;
    let c = 0;
    for (const line of lines) {
      const dc = getJournalLineDebitCredit(line);
      d += Number(dc.debit) || 0;
      c += Number(dc.credit) || 0;
    }
    return { displayDebit: d, displayCredit: c };
  }
  const { rowDebit, rowCredit } = getTransactionRowDebitCreditNet(t);
  const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
  const dC = pickAcct(debitCode);
  const cC = pickAcct(creditCode);
  const amt = Math.max(Math.abs(Number(t.amount) || 0), rowDebit, rowCredit);
  const ty = String(t.type || '').toLowerCase();

  if (dC && cC && dC !== cC && amt > 0) {
    const cat = String(t.category || '').toLowerCase();
    const src = String(t.source || '').toLowerCase();
    if (
      ty === 'income' &&
      (cat === 'booking_payment' ||
        src.includes('debtor_payment') ||
        cat === 'booking' ||
        src.includes('guest_booking'))
    ) {
      return { displayDebit: amt, displayCredit: amt };
    }
    if (ty === 'expense' && amt > 0) {
      return { displayDebit: amt, displayCredit: amt };
    }
  }
  if (dC && !cC && rowDebit === 0 && rowCredit > 0) {
    return { displayDebit: rowCredit, displayCredit: rowCredit };
  }
  if (!dC && cC && rowCredit === 0 && rowDebit > 0) {
    return { displayDebit: rowDebit, displayCredit: rowDebit };
  }
  return { displayDebit: rowDebit, displayCredit: rowCredit };
}

/**
 * Signed effect on one GL account for running balance (assets 1–2,6–8: debit − credit; 3–5 credit-normal).
 * @param {object} t
 * @param {string} accountCode
 */
export function ledgerRunningDeltaForAccount(t, accountCode) {
  const x = pickAcct(accountCode);
  if (!x || !t || typeof t !== 'object') return 0;

  const lines = t.lines ?? t.journalLines ?? t.ledgerLines;
  if (Array.isArray(lines) && lines.length > 0) {
    let delta = 0;
    const crNorm = isCreditNormalAccountCode(x);
    for (const line of lines) {
      if (pickAcct(getJournalLineAccountCode(line)) !== x) continue;
      const { debit, credit } = getJournalLineDebitCredit(line);
      const dr = Number(debit) || 0;
      const cr = Number(credit) || 0;
      delta += crNorm ? cr - dr : dr - cr;
    }
    return delta;
  }

  const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
  const dC = pickAcct(debitCode);
  const cC = pickAcct(creditCode);
  const { rowDebit, rowCredit } = getTransactionRowDebitCreditNet(t);
  const amt = Math.max(Math.abs(Number(t.amount) || 0), rowDebit, rowCredit);
  const crNorm = isCreditNormalAccountCode(x);

  if (dC === x && cC && cC !== x) return crNorm ? -amt : amt;
  if (cC === x && dC && dC !== x) return crNorm ? amt : -amt;

  if (dC === x && rowDebit === 0 && rowCredit > 0 && !cC) return crNorm ? -rowCredit : rowCredit;
  if (cC === x && rowCredit === 0 && rowDebit > 0 && !dC) return crNorm ? rowDebit : -rowDebit;

  if (dC === x && rowDebit > 0) return crNorm ? -rowDebit : rowDebit;
  if (cC === x && rowCredit > 0) return crNorm ? rowCredit : -rowCredit;
  return 0;
}
