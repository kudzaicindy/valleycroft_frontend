import { resolveTransactionCategoryForApi } from '@/constants/transactionCategories';

/**
 * Build body for POST/PUT transactions. Never sends read-only ledger fields.
 * Allowed: type, category, description, amount, debitAccount, creditAccount, date?, reference?, booking?
 *
 * Refund UI uses `type: 'refund'`; the API documents `income` | `expense` only, so we POST
 * `type: 'expense'` with `category: 'refund'` and Dr Revenue / Cr Cash (or chosen accounts).
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
  const type = isRefundUi ? 'expense' : uiType === 'income' ? 'income' : 'expense';
  let category = isRefundUi ? 'refund' : resolveTransactionCategoryForApi(raw.category);
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
