/**
 * Journal / journal-entries API helpers.
 * Supports flat line arrays and nested entries: { success, data: [{ lines: [...] }] }.
 */

import { unwrapApiBody, metaFromSuccessEnvelope } from '@/utils/apiEnvelope';

export { unwrapApiBody } from '@/utils/apiEnvelope';

/** Meta from `{ success, data, meta }` or axios-wrapped same. */
export function journalApiMeta(payload) {
  return metaFromSuccessEnvelope(payload);
}

/**
 * Normalize GET /api/accounting/journal-entries (and similar) body shapes to a flat line array
 * when the API already returns lines (legacy).
 */
export function normalizeJournalList(data) {
  const body = unwrapApiBody(data) ?? data;
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.lines)) return body.lines;
  if (Array.isArray(body.entries)) return body.entries;
  if (Array.isArray(body.items)) return body.items;
  if (Array.isArray(body.journals)) return body.journals;
  if (Array.isArray(body.results)) return body.results;
  if (Array.isArray(body.rows)) return body.rows;
  if (Array.isArray(body.data)) return body.data;
  if (body.entry && Array.isArray(body.entry.lines)) return body.entry.lines;
  return [];
}

function unwrapJournalEntriesArray(payload) {
  const body = unwrapApiBody(payload) ?? payload;
  if (body == null) return [];
  if (Array.isArray(body)) return body;
  if (typeof body === 'object' && Array.isArray(body.data)) return body.data;
  if (typeof body === 'object' && Array.isArray(body.entries)) return body.entries;
  return [];
}

/**
 * Turns journal entry documents into one row per line (for COA ledger, journal tables).
 * Merges entry-level date, reference, and id onto each line for display.
 */
export function flattenJournalEntriesToLines(payload) {
  const entries = unwrapJournalEntriesArray(payload);
  if (!entries.length) return [];

  const first = entries[0];
  const looksLikeFlatLine =
    first &&
    typeof first === 'object' &&
    !Array.isArray(first.lines) &&
    (first.debit != null ||
      first.credit != null ||
      first.accountId != null ||
      first.account != null);

  if (looksLikeFlatLine) {
    return entries.map((e) => (typeof e === 'object' && e ? { ...e } : e));
  }

  const out = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    /** Backend may send `lines` (journal) or `entries` (posted financial / same as finance API). */
    const lines = entry.lines ?? entry.entries;
    if (!Array.isArray(lines)) continue;

    const entryId = entry._id ?? entry.id;
    const entryDate = entry.entryDate ?? entry.date ?? entry.postedAt;
    const reference = entry.reference ?? entry.ref;
    const entryDescription = entry.description ?? entry.memo ?? entry.narration;

    for (const line of lines) {
      if (!line || typeof line !== 'object') continue;
      out.push({
        ...line,
        date: line.date ?? entryDate,
        entryDate: line.entryDate ?? entryDate,
        reference: line.reference ?? reference,
        journalEntryId: entryId,
        _entryDescription: entryDescription,
        entryType: entry.entryType ?? entry.entry_type,
      });
    }
  }
  return out;
}
