/**
 * Helpers to merge finance transactions with accounting journal lines for Chart of Accounts activity.
 */

export function getJournalLineAccountCode(j) {
  if (!j || typeof j !== 'object') return '';
  const direct =
    j.accountCode ?? j.account_code ?? j.glCode ?? j.gl_code ?? j.accountNumber ?? j.account_number;
  if (direct != null && typeof direct !== 'object') {
    const s = String(direct).trim();
    if (s) return s;
  }
  const acc = j.account ?? j.glAccount ?? j.gl_account;
  if (acc && typeof acc === 'object') {
    const c = acc.code ?? acc.glCode ?? acc.accountCode ?? acc.account_code;
    if (c != null) return String(c).trim();
  }
  return '';
}

export function getJournalLineDebitCredit(j) {
  if (!j || typeof j !== 'object') return { debit: 0, credit: 0 };
  let d = Number(j.debit ?? j.debitAmount ?? j.debit_amount ?? j.totalDebit ?? j.total_debit ?? 0) || 0;
  let c = Number(j.credit ?? j.creditAmount ?? j.credit_amount ?? j.totalCredit ?? j.total_credit ?? 0) || 0;
  if (d === 0 && c === 0 && j.amount != null) {
    const amt = Math.abs(Number(j.amount) || 0);
    const side = String(j.side ?? j.entryType ?? j.entry_type ?? '').toLowerCase();
    if (side === 'debit' || side === 'dr') d = amt;
    else if (side === 'credit' || side === 'cr') c = amt;
  }
  return { debit: d, credit: c };
}

export function journalLineTouchesAccount(j, code) {
  if (!code) return false;
  return getJournalLineAccountCode(j) === code;
}

/** Net effect on this account for one journal line (debit − credit), same sign sense as transaction net column. */
export function journalLineNetForAccount(j, code) {
  if (!journalLineTouchesAccount(j, code)) return 0;
  const { debit, credit } = getJournalLineDebitCredit(j);
  return debit - credit;
}

export function counterpartyJournalLine(j, glCode) {
  if (!j || typeof j !== 'object') return '—';
  const other =
    j.counterpartAccountCode ??
    j.counterpart_account_code ??
    j.offsetAccountCode ??
    j.offset_account_code ??
    j.pairAccountCode ??
    j.contraAccountCode;
  if (other != null && String(other).trim()) return String(other).trim();
  const ref = j.reference ?? j.ref ?? j.entryNumber ?? j.journalEntryId;
  if (ref != null && String(ref).trim()) return `Journal (${String(ref).slice(0, 24)})`;
  return 'Journal';
}

/**
 * Transactions that are not double-counted when journal lines exist: drop posted txns (have journalEntryId).
 */
export function transactionsForCoaLedger(txList, journalLines) {
  const list = Array.isArray(txList) ? txList : [];
  const hasJournals = Array.isArray(journalLines) && journalLines.length > 0;
  if (!hasJournals) return list;
  return list.filter((t) => !t?.journalEntryId);
}
