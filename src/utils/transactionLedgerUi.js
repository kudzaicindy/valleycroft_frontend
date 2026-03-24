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
