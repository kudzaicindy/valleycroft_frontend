import { ACCOUNT_OPTIONS } from '@/constants/financeAccounts';

export function labelFromConstantsAccount(code) {
  const c = String(code ?? '').trim();
  if (!c) return '—';
  const o = ACCOUNT_OPTIONS.find((x) => x.value === c);
  return o ? o.label.replace(/^\d+\s*-\s*/, '').trim() || o.label : c;
}

/** Never coerce a populated object to "[object Object]" for display or map keys. */
function scalarAccountCode(val) {
  if (val == null) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val).trim();
  if (typeof val === 'object') {
    const inner = val.code ?? val.glCode ?? val.accountCode ?? val.value;
    if (inner != null && (typeof inner === 'string' || typeof inner === 'number')) {
      return String(inner).trim();
    }
    return '';
  }
  return String(val).trim();
}

export function coalesceAccountCode(a) {
  const keys = [a.code, a.accountCode, a.account_code, a.glCode];
  for (const k of keys) {
    const s = scalarAccountCode(k);
    if (s) return s;
  }
  return '';
}

/** Normalize GET /api/accounting/accounts (and legacy aliases) responses. */
export function normalizeAccountsFromResponse(res) {
  const payload = res?.data !== undefined ? res.data : res;
  const raw = Array.isArray(payload)
    ? payload
    : payload?.accounts ?? payload?.data ?? payload?.items ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a, i) => {
      const codeRaw = coalesceAccountCode(a);
      const code = codeRaw || null;
      const name = String(a.name ?? a.accountName ?? a.account_name ?? a.label ?? '').trim();
      const type = String(a.type ?? a.accountType ?? a.account_type ?? '')
        .trim()
        .toUpperCase();
      const rawOb =
        a.openingBalance ??
        a.opening_balance ??
        a.openingBalanceAmount ??
        a.beginningBalance ??
        a.beginning_balance;
      const openingBalance =
        rawOb != null && rawOb !== '' && Number.isFinite(Number(rawOb)) ? Number(rawOb) : null;
      const openingAsOf = String(
        a.openingBalanceAsOf ?? a.opening_balance_as_of ?? a.openingAsOf ?? ''
      ).slice(0, 10);
      const openingBalanceNote = String(
        a.openingBalanceNote ?? a.opening_balance_note ?? ''
      ).trim() || null;
      const subType = String(a.subType ?? a.sub_type ?? '').trim() || null;
      const category =
        String(a.category ?? a.accountCategory ?? a.account_category ?? '').trim() || null;
      const normalBalance = String(a.normalBalance ?? a.normal_balance ?? '')
        .trim()
        .toUpperCase() || null;
      return {
        code: code || null,
        name: name || labelFromConstantsAccount(codeRaw) || `Account ${i + 1}`,
        type,
        subType,
        category,
        normalBalance,
        id: a._id ?? a.id ?? null,
        openingBalance,
        openingAsOf: openingAsOf || null,
        openingBalanceNote,
        _raw: a,
      };
    })
    .filter((a) => a.id || a.code);
}

/** `{ value, label }[]` for debit/credit `<select>`s; `value` is always a GL code. */
export function accountsToDebitCreditSelectOptions(normalizedRows) {
  if (!Array.isArray(normalizedRows)) return [];
  return normalizedRows
    .filter((a) => a.code && String(a.code).trim() !== '')
    .map((a) => {
      const code = String(a.code).trim();
      const name = String(a.name || '').trim() || code;
      return {
        value: code,
        label: `${code} — ${name}`,
      };
    })
    .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
}
