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

/**
 * Ledger account codes + optional display names from API (camelCase or snake_case).
 */
export function getTransactionDebitCreditAccounts(t) {
  if (!t || typeof t !== 'object') {
    return { debitCode: '', creditCode: '', debitName: '', creditName: '' };
  }
  const debitCode = String(
    t.debitAccount ?? t.debitAccountCode ?? t.accountDebited ?? t.debitedAccountCode ?? t.debit_account ?? ''
  ).trim();
  const creditCode = String(
    t.creditAccount ?? t.creditAccountCode ?? t.accountCredited ?? t.creditedAccountCode ?? t.credit_account ?? ''
  ).trim();
  const debitName = String(
    t.debitAccountName ?? t.debit_account_name ?? t.debitedAccountName ?? t.debited_account_name ?? ''
  ).trim();
  const creditName = String(
    t.creditAccountName ?? t.credit_account_name ?? t.creditedAccountName ?? t.credited_account_name ?? ''
  ).trim();
  return { debitCode, creditCode, debitName, creditName };
}
