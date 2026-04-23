/**
 * Normalizes the response from `getTransactions()` / `GET /api/finance/transactions`.
 * Handles direct arrays, `{ data: [] }`, `{ transactions: [] }`, and `{ meta }`.
 *
 * When the API returns enriched metadata, `meta` may include:
 * - `apiPath` — canonical route
 * - `byAccount` — per-account debit/credit totals and `drillDown.lines` (omit with `includeByAccount=0`)
 * - `accountFilter` — when filtering by `accountCode`: `scanCap`, `scanned`, `matchingRows`, etc.
 *
 * @param {unknown} res - Axios response (`await getTransactions(...)`) or raw API body
 * @returns {{ list: object[], meta: object }}
 */
function normalizeType(row) {
  const explicit = String(row?.type || '').toLowerCase();
  if (explicit === 'income' || explicit === 'expense') return explicit;
  const tt = String(row?.transactionType || '').toLowerCase();
  if (
    /income|revenue|receipt|sale|booking_payment|other_income|payment/.test(tt) ||
    String(row?.source || '').toLowerCase() === 'debtor_payment'
  ) {
    return 'income';
  }
  if (/expense|cost|refund|salary|payout|withdrawal/.test(tt)) return 'expense';
  return '';
}

function normalizeAmount(row) {
  const direct = Number(row?.amount);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const credit = Number(row?.totalCredit);
  const debit = Number(row?.totalDebit);
  if (Number.isFinite(credit) && Number.isFinite(debit)) return Math.max(credit, debit, 0);
  if (Number.isFinite(credit)) return Math.abs(credit);
  if (Number.isFinite(debit)) return Math.abs(debit);
  return 0;
}

function normalizeTransactionRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    type: normalizeType(row) || row.type || '',
    category: row.category || row.transactionType || '',
    amount: normalizeAmount(row),
  };
}

export function normalizeTransactionsFetchResult(res) {
  const body = res && typeof res === 'object' && 'data' in res && !Array.isArray(res) ? res.data : res;
  if (Array.isArray(body)) {
    return { list: body.map(normalizeTransactionRow), meta: {} };
  }
  if (!body || typeof body !== 'object') {
    return { list: [], meta: {} };
  }
  const rawList = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body.transactions)
      ? body.transactions
      : [];
  const list = rawList.map(normalizeTransactionRow);
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  return { list, meta };
}
