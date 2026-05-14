import { resolveTransactionCategoryForApi } from '@/constants/transactionCategories';

/**
 * Build body for POST/PUT transactions. Never sends read-only ledger fields.
 * Allowed: type, category, description, amount, debitAccount, creditAccount, date?, reference?, booking?
 *
 * Refund UI uses `type: 'refund'`; the API documents `income` | `expense` only, so we POST
 * `type: 'expense'` with `category: 'refund'` and Dr Revenue / Cr Cash (or chosen accounts).
 *
 * **CAPEX (form type `capex`):** POSTs `type: 'expense'` and `category: 'fixed_asset'` — API cash-out encoding only; not shown on the operating Expenses list.
 *
 * **Owner capital (`category: owner_investment`, alias `capital_injection`):** POSTs `type: 'income'`.
 * Omit `debitAccount`/`creditAccount` to let the API default **Dr 1001 / Cr 3001**, or set them explicitly to the same posting.
 */
const READ_ONLY_KEYS = new Set([
  'journalEntryId',
  '_id',
  'id',
  'createdAt',
  'updatedAt',
  '__v',
]);

export function buildTransactionWritePayload(raw) {
  const uiType = String(raw.type || 'expense').toLowerCase();
  const isRefundUi = uiType === 'refund';
  const isCapexUi = uiType === 'capex';
  let category = isRefundUi
    ? 'refund'
    : isCapexUi
      ? 'fixed_asset'
      : resolveTransactionCategoryForApi(raw.category);
  const isOwnerInvestment = category === 'owner_investment';
  const type = isOwnerInvestment
    ? 'income'
    : isRefundUi || isCapexUi
      ? 'expense'
      : uiType === 'income'
        ? 'income'
        : 'expense';
  const description = String(raw.description || '').trim();
  const amount = Number(raw.amount);
  const debitAccount = String(raw.debitAccount || '').trim();
  const creditAccount = String(raw.creditAccount || '').trim();

  if (!category) {
    const err = new Error('Please choose a category.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!description) {
    const err = new Error('Please enter a description.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (Number.isNaN(amount) || amount <= 0) {
    const err = new Error('Amount must be a positive number.');
    err.code = 'VALIDATION';
    throw err;
  }

  if (isOwnerInvestment) {
    const body = { type: 'income', category, description, amount };
    if (debitAccount && creditAccount) {
      if (debitAccount === creditAccount) {
        const err = new Error('Debit and credit accounts must be different.');
        err.code = 'VALIDATION';
        throw err;
      }
      body.debitAccount = debitAccount;
      body.creditAccount = creditAccount;
    } else if (debitAccount || creditAccount) {
      const err = new Error('For owner capital, choose both debit and credit accounts, or leave both blank for Dr 1001 / Cr 3001.');
      err.code = 'VALIDATION';
      throw err;
    }
    const date = String(raw.date || '').trim();
    if (date) body.date = date;
    const reference = String(raw.reference || '').trim();
    if (reference) body.reference = reference;
    const booking = String(raw.booking || '').trim();
    if (booking) body.booking = booking;
    return body;
  }

  if (!debitAccount) {
    const err = new Error('Please choose the account to debit.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!creditAccount) {
    const err = new Error('Please choose the account to credit.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (debitAccount === creditAccount) {
    const err = new Error('Debit and credit accounts must be different.');
    err.code = 'VALIDATION';
    throw err;
  }

  const body = { type, category, description, amount, debitAccount, creditAccount };

  const date = String(raw.date || '').trim();
  if (date) body.date = date;

  const reference = String(raw.reference || '').trim();
  if (reference) body.reference = reference;

  const booking = String(raw.booking || '').trim();
  if (booking) body.booking = booking;

  return body;
}

/** Strip any ledger/read-only keys from a spread object (defensive). */
export function omitReadOnlyTransactionFields(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = { ...obj };
  READ_ONLY_KEYS.forEach((k) => {
    delete out[k];
  });
  return out;
}
