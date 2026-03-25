/**
 * Normalizes the response from `getTransactions()` / `GET /api/finance/transactions` (same as Transactions page).
 * Handles direct arrays, `{ data: [] }`, `{ transactions: [] }`, and `{ meta }`.
 *
 * @param {unknown} res - Axios response (`await getTransactions(...)`) or raw API body
 * @returns {{ list: object[], meta: object }}
 */
export function normalizeTransactionsFetchResult(res) {
  const body = res && typeof res === 'object' && 'data' in res && !Array.isArray(res) ? res.data : res;
  if (Array.isArray(body)) {
    return { list: body, meta: {} };
  }
  if (!body || typeof body !== 'object') {
    return { list: [], meta: {} };
  }
  const list = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body.transactions)
      ? body.transactions
      : [];
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  return { list, meta };
}
