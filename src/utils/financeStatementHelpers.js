/** Sum line items from income-statement style arrays */
export function sumLineItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

export function incomeStatementMetrics(data) {
  if (!data) return { revenue: 0, expense: 0, net: 0, incomeRows: [], expenseRows: [] };
  const d = data && typeof data === 'object' && data.data && !Array.isArray(data.data) ? data.data : data;

  // Legacy array shape.
  if (Array.isArray(d?.income) || Array.isArray(d?.expense)) {
    const incomeRows = Array.isArray(d.income) ? d.income : [];
    const expenseRows = Array.isArray(d.expense) ? d.expense : [];
    const revenue = sumLineItems(incomeRows);
    const expense = sumLineItems(expenseRows);
    return { revenue, expense, net: revenue - expense, incomeRows, expenseRows };
  }

  // Structured shape:
  // { revenue: {..., total}, cogs: {..., total}, opex: {..., total}, netIncome }
  const revenueRows = Object.entries(d?.revenue || {})
    .filter(([k, v]) => k !== 'total' && Number.isFinite(Number(v)))
    .map(([k, v]) => ({ key: k, label: toTitleFromKey(k), amount: Number(v) || 0 }));
  const cogsRows = Object.entries(d?.cogs || {})
    .filter(([k, v]) => k !== 'total' && Number.isFinite(Number(v)))
    .map(([k, v]) => ({ key: `cogs_${k}`, label: toTitleFromKey(k), amount: Number(v) || 0 }));
  const opexRows = Object.entries(d?.opex || {})
    .filter(([k, v]) => k !== 'total' && Number.isFinite(Number(v)))
    .map(([k, v]) => ({ key: `opex_${k}`, label: toTitleFromKey(k), amount: Number(v) || 0 }));

  const incomeRows = revenueRows;
  const expenseRows = [...cogsRows, ...opexRows];
  const revenue = d?.revenue?.total != null ? (Number(d.revenue.total) || 0) : sumLineItems(incomeRows);
  const expense = (d?.cogs?.total != null ? (Number(d.cogs.total) || 0) : sumLineItems(cogsRows))
    + (d?.opex?.total != null ? (Number(d.opex.total) || 0) : sumLineItems(opexRows));
  const net = d?.netIncome != null ? (Number(d.netIncome) || 0) : (revenue - expense);
  return { revenue, expense, net, incomeRows, expenseRows };
}

export function cashflowMetrics(data) {
  const d = data && typeof data === 'object' && data.data && !Array.isArray(data.data) ? data.data : data;

  // Legacy aggregate array shape: [{ _id: 'income'|'expense', total }]
  const arr = Array.isArray(data) ? data : [];
  if (arr.length > 0) {
    const inflow = arr.find((x) => x._id === 'income')?.total ?? 0;
    const outflow = arr.find((x) => x._id === 'expense')?.total ?? 0;
    return {
      inflow: Number(inflow) || 0,
      outflow: Number(outflow) || 0,
      net: (Number(inflow) || 0) - (Number(outflow) || 0),
    };
  }

  // Structured cashflow shape: { operating, investing, financing, netChange, ... }
  if (d && typeof d === 'object') {
    const op = Number(d.operating?.total ?? 0) || 0;
    const inv = Number(d.investing?.total ?? 0) || 0;
    const fin = Number(d.financing?.total ?? 0) || 0;
    const net = d.netChange != null
      ? (Number(d.netChange) || 0)
      : (op + inv + fin);

    // Show positive totals as receipts and negative totals as payments.
    const inflow = [op, inv, fin].reduce((s, v) => s + (v > 0 ? v : 0), 0);
    const outflow = [op, inv, fin].reduce((s, v) => s + (v < 0 ? Math.abs(v) : 0), 0);

    return { inflow, outflow, net };
  }

  return {
    inflow: 0,
    outflow: 0,
    net: 0,
  };
}

export function cashflowStatementMetrics(data) {
  const d = data && typeof data === 'object' && data.data && !Array.isArray(data.data) ? data.data : data;
  if (!d || typeof d !== 'object') {
    return { operating: 0, investing: 0, financing: 0, netChange: 0, openingCash: 0, closingCash: 0 };
  }
  const inflowT = d.cash_inflow?.total;
  const outflowT = d.cash_outflow?.total;
  const operatingFromCashIO =
    inflowT != null && outflowT != null
      ? (Number(inflowT) || 0) - (Number(outflowT) || 0)
      : null;
  const operating = Number(
    d.operating?.total ??
    d.operating_activities?.total ??
    d.operating_activities?.net ??
    (operatingFromCashIO != null ? operatingFromCashIO : 0)
  ) || 0;
  const investing = Number(
    d.investing?.total ??
    d.investing_activities?.total ??
    0
  ) || 0;
  const financing = Number(
    d.financing?.total ??
    d.financing_activities?.total ??
    0
  ) || 0;
  const netChange = d.netChange != null
    ? (Number(d.netChange) || 0)
    : d.net_change_in_cash != null
      ? (Number(d.net_change_in_cash) || 0)
      : d.cash_breakdown?.net_change_in_cash != null
        ? (Number(d.cash_breakdown.net_change_in_cash) || 0)
        : (operating + investing + financing);
  const openingCash = Number(
    d.openingCash ??
    d.opening_cash ??
    d.cash_breakdown?.beginning_cash ??
    0
  ) || 0;
  const closingCash = d.closingCash != null
    ? (Number(d.closingCash) || 0)
    : d.closing_cash != null
      ? (Number(d.closing_cash) || 0)
      : d.cash_breakdown?.ending_cash != null
        ? (Number(d.cash_breakdown.ending_cash) || 0)
        : (openingCash + netChange);
  return { operating, investing, financing, netChange, openingCash, closingCash };
}

export function cashflowSectionRows(data, sectionKey) {
  const d = data && typeof data === 'object' && data.data && !Array.isArray(data.data) ? data.data : data;
  const section = d?.[sectionKey];
  if (!section || typeof section !== 'object') return [];
  return Object.entries(section)
    .filter(([k, v]) => k !== 'total' && Number.isFinite(Number(v)))
    .map(([k, v]) => ({
      key: k,
      label: toTitleFromKey(k),
      amount: Number(v) || 0,
    }));
}

function normalizeCashflowRows(value) {
  const CASHFLOW_LABEL_OVERRIDES = {
    netIncome: 'Rent paid',
  };
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((r, i) => {
        const key = r.key ?? r.code ?? r.accountCode ?? r.name ?? r.label ?? `row_${i}`;
        const label = r.label ?? r.name ?? r.accountName ?? CASHFLOW_LABEL_OVERRIDES[String(key)] ?? toTitleFromKey(key);
        const amount = Number(r.amount ?? r.value ?? r.total ?? 0);
        if (!Number.isFinite(amount)) return null;
        return { key: String(key), label: String(label), amount };
      })
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([k, v]) => k !== 'total' && Number.isFinite(Number(v)))
      .map(([k, v]) => ({
        key: String(k),
        label: CASHFLOW_LABEL_OVERRIDES[String(k)] ?? toTitleFromKey(k),
        amount: Number(v) || 0,
      }));
  }
  return [];
}

/** Per-account balances: `cash_balance_by_account`, `cash_accounts.breakdown`, etc. */
function cashAccountRowsFromApi(d) {
  if (!d || typeof d !== 'object') return [];
  const out = [];
  const seen = new Set();
  function addFromMap(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    for (const [k, v] of Object.entries(map)) {
      if (k === 'total' || !v || typeof v !== 'object' || Array.isArray(v)) continue;
      const code = String(v.accountCode ?? v.account_code ?? k).trim();
      const bal = Number(v.balance ?? v.amount ?? v.value ?? 0);
      if (!Number.isFinite(bal)) continue;
      const label = v.accountName ?? v.account_name ?? code;
      const key = `cashAcc_${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: String(label || code), amount: bal });
    }
  }
  addFromMap(d.cash_balance_by_account);
  const nested =
    d.cash_accounts?.breakdown ?? d.cash_accounts?.accounts ?? d.cash_accounts?.by_account;
  if (nested && typeof nested === 'object') addFromMap(nested);
  return out;
}

export function cashflowDetailedSections(data) {
  const d = data && typeof data === 'object' && data.data && !Array.isArray(data.data) ? data.data : data;
  const metrics = cashflowStatementMetrics(d);
  const skipOperatingAggRows =
    (Array.isArray(d?.cash_inflow?.categories) && d.cash_inflow.categories.length > 0) ||
    (Array.isArray(d?.cash_outflow?.categories) && d.cash_outflow.categories.length > 0);
  const operating = normalizeCashflowRows(
    d?.operating?.lines ??
    d?.operating ??
    d?.operating_activities?.lines ??
    (!skipOperatingAggRows ? d?.operating_activities : null) ??
    d?.detailed_breakdown?.income?.categories
  );
  const cashInByCategory = Array.isArray(d?.byCategory?.cashIn)
    ? d.byCategory.cashIn.map((r) => ({
      key: `cashIn_${r.category ?? r._id ?? 'other'}`,
      label: toTitleFromKey(r.category ?? r._id ?? 'cash in'),
      amount: Number(r.total ?? r.amount ?? 0) || 0,
    }))
    : [];
  const cashOutByCategory = Array.isArray(d?.byCategory?.cashOut)
    ? d.byCategory.cashOut.map((r) => ({
      key: `cashOut_${r.category ?? r._id ?? 'other'}`,
      label: toTitleFromKey(r.category ?? r._id ?? 'cash out'),
      amount: -(Math.abs(Number(r.total ?? r.amount ?? 0) || 0)),
    }))
    : [];
  const cashInflowCategories = Array.isArray(d?.cash_inflow?.categories)
    ? d.cash_inflow.categories.map((r) => ({
        key: `cashIn_${r.category ?? r._id ?? 'other'}`,
        label: toTitleFromKey(r.category ?? r._id ?? 'cash in'),
        amount: Number(r.total ?? r.amount ?? 0) || 0,
      }))
    : [];
  const cashOutflowCategories = Array.isArray(d?.cash_outflow?.categories)
    ? d.cash_outflow.categories.map((r) => ({
        key: `cashOut_${r.category ?? r._id ?? 'other'}`,
        label: toTitleFromKey(r.category ?? r._id ?? 'cash out'),
        amount: -(Math.abs(Number(r.total ?? r.amount ?? 0) || 0)),
      }))
    : [];
  const operatingMerged = [
    ...operating,
    ...cashInByCategory,
    ...cashOutByCategory,
    ...cashInflowCategories,
    ...cashOutflowCategories,
  ];
  const operatingIncome = operatingMerged.filter((r) => r.amount >= 0);
  const operatingExpense = operatingMerged.filter((r) => r.amount < 0);
  const investing = normalizeCashflowRows(
    d?.investing?.lines ??
    d?.investing ??
    d?.investing_activities?.lines ??
    d?.investing_activities
  );
  const financing = normalizeCashflowRows(
    d?.financing?.lines ??
    d?.financing ??
    d?.financing_activities?.lines ??
    d?.financing_activities
  );
  const cashAccounts = [
    ...normalizeCashflowRows(
      d?.cashAndCashEquivalents ??
      d?.cashAndCashEquivalent ??
      d?.cashAccounts ??
      d?.cashBalances
    ),
    ...cashAccountRowsFromApi(d),
  ];
  // Keep summary totals and detailed line arrays side by side without key collisions.
  return {
    ...metrics,
    operatingIncome,
    operatingExpense,
    investingRows: investing,
    financingRows: financing,
    cashAccounts,
  };
}

export function plMetrics(data) {
  if (!data) return { income: 0, expense: 0, profit: 0 };
  const income = Number(data.income) || 0;
  const expense = Number(data.expense) || 0;
  const profit = data.profit != null ? Number(data.profit) : income - expense;
  return { income, expense, profit };
}

/** Group balance sheet lines when API sends section/type */
export function groupBalanceSheetItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [{ key: 'all', label: 'Statement of financial position', rows: items || [] }];
  }
  const hasSection = items.some((r) => r.section || r.statementSection || r.group);
  if (!hasSection) {
    return [{ key: 'all', label: 'Line items', rows: items }];
  }
  const groups = new Map();
  for (const row of items) {
    const raw = (row.section || row.statementSection || row.group || row.type || 'other').toString().toLowerCase();
    let key = 'other';
    if (/asset/.test(raw)) key = 'assets';
    else if (/liabilit/.test(raw)) key = 'liabilities';
    else if (/equit/.test(raw)) key = 'equity';
    else key = raw.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'other';
    if (!groups.has(key)) {
      let label = row.section || row.statementSection || row.group || row.type;
      if (key === 'assets') label = 'Assets';
      else if (key === 'liabilities') label = 'Liabilities';
      else if (key === 'equity') label = 'Equity';
      groups.set(key, { key, label: label || key, rows: [] });
    }
    groups.get(key).rows.push(row);
  }
  const order = ['assets', 'liabilities', 'equity'];
  const ordered = [];
  for (const k of order) {
    if (groups.has(k)) ordered.push(groups.get(k));
  }
  for (const [, g] of groups) {
    if (!order.includes(g.key)) ordered.push(g);
  }
  return ordered;
}

export function rowLabel(row) {
  return row.description ?? row.category ?? row.name ?? row.label ?? '—';
}

export function rowAmount(row) {
  return row.amount ?? row.value ?? 0;
}

function toTitleFromKey(k) {
  return String(k || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function isBalanceSheetAccountLine(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (v.amount == null && v.value == null) return false;
  const amt = Number(v.amount ?? v.value);
  if (!Number.isFinite(amt)) return false;
  return (
    'accountName' in v ||
    'account_name' in v ||
    'accountCode' in v ||
    'account_code' in v
  );
}

function pushObjectRows(out, section, group, obj, type = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'total') {
      if (v != null && typeof v === 'object' && !Array.isArray(v) && isBalanceSheetAccountLine(v)) {
        const amount = Number(v.amount ?? v.value ?? 0) || 0;
        const code = v.accountCode ?? v.account_code ?? v.code ?? '';
        const name =
          v.accountName ??
          v.account_name ??
          v.name ??
          'Subtotal';
        out.push({
          section,
          group: group || section,
          type: type || group || section,
          code: code != null && code !== '' ? String(code) : '',
          name: String(name),
          amount,
          _bsSubtotal: true,
        });
      }
      continue;
    }
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      if (isBalanceSheetAccountLine(v)) {
        const amount = Number(v.amount ?? v.value ?? 0) || 0;
        const code = v.accountCode ?? v.account_code ?? v.code ?? '';
        const name =
          v.accountName ??
          v.account_name ??
          v.name ??
          toTitleFromKey(k);
        out.push({
          section,
          group: group || section,
          type: type || group || section,
          code: code != null && code !== '' ? String(code) : '',
          name: String(name || toTitleFromKey(k)),
          amount,
        });
        continue;
      }
      pushObjectRows(out, section, `${group ? `${group} ` : ''}${toTitleFromKey(k)}`.trim(), v, type || k);
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out.push({
      section,
      group: group || section,
      type: type || group || section,
      code: '',
      name: toTitleFromKey(k),
      amount: n,
    });
  }
}

/**
 * Normalize balance-sheet payload to line-item rows.
 * Supports:
 * - array rows
 * - { items | lineItems }
 * - structured object { assets, liabilities, equity }
 */
export function normalizeBalanceSheetRows(data) {
  if (Array.isArray(data)) return data;
  const d = data && typeof data === 'object' && data.data && !Array.isArray(data.data) ? data.data : data;
  if (!d || typeof d !== 'object') return [];
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.lineItems)) return d.lineItems;

  const out = [];
  if (d.assets) pushObjectRows(out, 'Assets', 'Assets', d.assets, 'assets');
  if (d.liabilities) pushObjectRows(out, 'Liabilities', 'Liabilities', d.liabilities, 'liabilities');
  if (d.equity) pushObjectRows(out, 'Equity', 'Equity', d.equity, 'equity');
  return out;
}

/** Read section grand total from API object `{ total: { amount } | number }`. */
export function readBalanceSheetSectionTotal(sectionObj) {
  if (!sectionObj || typeof sectionObj !== 'object') return null;
  const t = sectionObj.total;
  if (t == null) return null;
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  if (typeof t === 'object' && t.amount != null) {
    const n = Number(t.amount);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Sum line rows only (exclude rolled-up subtotal lines from nested `total` keys). */
export function sumBalanceSheetLines(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((s, r) => {
    if (r && r._bsSubtotal) return s;
    return s + (Number(rowAmount(r)) || 0);
  }, 0);
}
