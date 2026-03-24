/**
 * Normalize axios/API errors after interceptors (message + optional server hint).
 */

export function getApiErrorHint(err) {
  if (!err) return '';
  if (typeof err.hint === 'string' && err.hint.trim()) return err.hint.trim();
  const data = err.response?.data;
  if (data && typeof data === 'object' && typeof data.hint === 'string') {
    return data.hint.trim();
  }
  return '';
}

/** True when message/hint suggests ledger posting failed (400 from finance). */
export function looksLikeLedgerPostError(err) {
  const msg = (err?.message || '').toLowerCase();
  const hint = getApiErrorHint(err).toLowerCase();
  const combined = `${msg} ${hint}`;
  return (
    combined.includes('ledger') ||
    combined.includes('journal') ||
    combined.includes('accounting') ||
    combined.includes('seed:accounting')
  );
}

/**
 * User-facing lines for failed transaction create/update.
 * Server may return 400 + hint to run seed:accounting.
 */
export function formatTransactionMutationMessage(err) {
  const message = err?.message || 'Could not save transaction.';
  const hint = getApiErrorHint(err);
  const lines = [message];
  if (hint && !message.includes(hint)) {
    lines.push(hint);
  }
  if (looksLikeLedgerPostError(err)) {
    lines.push(
      'If this keeps happening, ask an admin to set up accounting on the server (for example: npm run seed:accounting).'
    );
  }
  return lines.filter(Boolean);
}
