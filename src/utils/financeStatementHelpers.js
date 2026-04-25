/** Sum line items from income-statement style arrays */
export function sumLineItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

/**
 * P&L payloads like `{ success, basis: 'double_entry_v3', data: { current: { presentation, revenue, costOfSales, operatingExpenses, ... } } }`.
 * Merges `presentation` with top-level period fields and maps to { revenue, cogs, opex, netIncome } for the structured branch below.
 */
function normalizeDoubleEntryV3Period(cur) {
  if (!cur || typeof cur !== 'object') return null;
  const pres = cur.presentation && typeof cur.presentation === 'object' ? cur.presentation : {};
  function mergeSection(key) {
    const a = pres[key] && typeof pres[key] === 'object' && !Array.isArray(pres[key]) ? { ...pres[key] } : {};
    const b = cur[key] && typeof cur[key] === 'object' && !Array.isArray(cur[key]) ? cur[key] : {};
    return { ...a, ...b };
  }
  const revenue = mergeSection('revenue');
  const cogs = mergeSection('costOfSales');
  const opex = mergeSection('operatingExpenses');
  if (revenue.total == null) {
    if (revenue.netRevenue != null) revenue.total = Number(revenue.netRevenue) || 0;
    else if (revenue.grossRevenue != null) revenue.total = Number(revenue.grossRevenue) || 0;
  }
  if (opex.total == null && cur.totalOperatingExpenses != null) {
    opex.total = Number(cur.totalOperatingExpenses) || 0;
  }
  const netIncome =
    cur.netProfitBeforeTax != null
      ? Number(cur.netProfitBeforeTax)
      : pres.netProfitBeforeTax != null
        ? Number(pres.netProfitBeforeTax)
        : cur.netProfit != null
          ? Number(cur.netProfit)
          : cur.operatingProfitEBIT != null
            ? Number(cur.operatingProfitEBIT)
            : undefined;
  return {
    revenue,
    cogs,
    opex,
    ...(Number.isFinite(netIncome) ? { netIncome } : {}),
  };
}

const P_L_SECTION_LINE_KEYS = ['lines', 'accounts', 'lineItems', 'items'];
const P_L_SECTION_SCALAR_SKIP = new Set([
  ...P_L_SECTION_LINE_KEYS,
  'total',
  'netRevenue',
  'grossRevenue',
  'presentation',
  'metadata',
  'transaction_count',
]);

/**
 * Map API account lines (double_entry_v3 style) to statement rows with `accountCodes` for transaction drill.
 * @param {object[]} lines
 * @param {string} keyPrefix - e.g. `rev_`, `cogs_`, `opex_`
 */
function mapIncomeStatementLinesToRows(lines, keyPrefix) {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || typeof line !== 'object') continue;
    const raw = Number(line.balance ?? line.amount ?? line.value ?? 0);
    if (!Number.isFinite(raw)) continue;
    let accountCodes = plLineCollectAccountCodes(line);
    const codeHint = String(line.accountCode ?? line.account_code ?? '').trim();
    if ((!accountCodes || accountCodes.length === 0) && isPlGlAccountCodeString(codeHint)) {
      accountCodes = [codeHint];
    }
    const suffix =
      accountCodes?.[0] && isPlGlAccountCodeString(accountCodes[0])
        ? accountCodes[0]
        : codeHint && isPlGlAccountCodeString(codeHint)
          ? codeHint
          : `row_${i}`;
    const key = `${keyPrefix}${suffix}`;
    const label = String(
      line.accountName ??
        line.account_name ??
        line.name ??
        line.description ??
        toTitleFromKey(suffix)
    );
    out.push({
      key,
      label,
      amount: raw,
      ...(accountCodes?.length ? { accountCodes } : {}),
    });
  }
  return out;
}

/**
 * Some income APIs only put account-level P&amp;L under `presentation.sections` (like balance sheet), not under `revenue.lines`.
 * @param {object | null | undefined} host - e.g. `data.current` or top-level statement object
 * @returns {{ incomeRows: object[], expenseRows: object[] } | null}
 */
function plRowsFromPresentationSections(host) {
  const sections = host?.presentation?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const incomeRows = [];
  const expenseRows = [];
  for (const sec of sections) {
    const lines = sec?.lines ?? sec?.accounts ?? sec?.lineItems;
    if (!Array.isArray(lines) || lines.length === 0) continue;
    const hay = `${String(sec?.key ?? '')} ${String(sec?.label ?? '')}`.toLowerCase();
    if (/(net\s+(profit|income)|profit\s+after|taxation|income\s+tax|ebitda|comprehensive)/i.test(hay)) continue;
    const isCogs = /(cost\s*of\s*sales|cost_of_sales|cogs|cost of goods)/i.test(hay);
    const isOpex =
      /(operating\s*expense|operating_expense|opex|administrative|selling|overhead)/i.test(hay) && !isCogs;
    const isRevenue =
      /(revenue|turnover|sales|gross\s*profit|operating\s*income)/i.test(hay) && !isCogs && !isOpex;
    if (isRevenue) incomeRows.push(...mapIncomeStatementLinesToRows(lines, 'rev_'));
    else if (isCogs) expenseRows.push(...mapIncomeStatementLinesToRows(lines, 'cogs_'));
    else if (isOpex) expenseRows.push(...mapIncomeStatementLinesToRows(lines, 'opex_'));
  }
  if (!incomeRows.length && !expenseRows.length) return null;
  return { incomeRows, expenseRows };
}

/** Prefer `lines` / `accounts` arrays on a section object; else scalar map rows via {@link plStructuredPlRow}. */
function plSectionToIncomeExpenseRows(section, mapKeyPrefix) {
  if (!section || typeof section !== 'object') return [];
  const lineSrc = P_L_SECTION_LINE_KEYS.map((k) => section[k]).find((x) => Array.isArray(x) && x.length > 0);
  if (lineSrc) {
    const pfx = mapKeyPrefix === '' ? 'rev_' : mapKeyPrefix;
    return mapIncomeStatementLinesToRows(lineSrc, pfx);
  }
  return Object.entries(section)
    .filter(([k, v]) => !P_L_SECTION_SCALAR_SKIP.has(k) && k !== 'total')
    .map(([k, v]) => plStructuredPlRow(k, v, mapKeyPrefix))
    .filter(Boolean);
}

export function incomeStatementMetrics(data) {
  if (!data) return { revenue: 0, expense: 0, net: 0, incomeRows: [], expenseRows: [] };
  const root = unwrapFinancePayload(data);
  let wrapped = root && typeof root === 'object' && root.data && !Array.isArray(root.data) ? root.data : root;
  let d = wrapped;
  /** Keep reference to payload that still has `presentation` after `d` is replaced by merged revenue/cogs/opex. */
  let presentationHost =
    d && typeof d === 'object' && d.current && typeof d.current === 'object' && !Array.isArray(d.current)
      ? d.current
      : d && typeof d === 'object'
        ? d
        : null;
  if (d && typeof d === 'object' && d.current && typeof d.current === 'object' && !Array.isArray(d.current)) {
    const normalized = normalizeDoubleEntryV3Period(d.current);
    if (normalized) d = normalized;
  }

  // Legacy array shape.
  if (Array.isArray(d?.income) || Array.isArray(d?.expense)) {
    const incomeRows = Array.isArray(d.income)
      ? d.income.map((row) => {
          const accountCodes = plLineCollectAccountCodes(row);
          return accountCodes ? { ...row, accountCodes } : row;
        })
      : [];
    const expenseRows = Array.isArray(d.expense)
      ? d.expense.map((row) => {
          const accountCodes = plLineCollectAccountCodes(row);
          return accountCodes ? { ...row, accountCodes } : row;
        })
      : [];
    const revenue = sumLineItems(incomeRows);
    const expense = sumLineItems(expenseRows);
    return { revenue, expense, net: revenue - expense, incomeRows, expenseRows };
  }

  // Structured shape:
  // { revenue: {..., total}, cogs: {..., total}, opex: {..., total}, netIncome }
  // (includes normalized double_entry_v3 `data.current` payloads)
  // Many APIs send `revenue.lines` / `costOfSales.lines` / `operatingExpenses.lines` with `accountCode` — not only scalar map entries.
  const revenueSection = d?.revenue || {};
  const cogsSection = d?.cogs || d?.costOfSales || {};
  const opexSection = d?.opex || d?.operatingExpenses || {};

  const revenueRows = plSectionToIncomeExpenseRows(revenueSection, '');
  const cogsRows = plSectionToIncomeExpenseRows(cogsSection, 'cogs_');
  const opexRows = plSectionToIncomeExpenseRows(opexSection, 'opex_');

  let incomeRows = revenueRows;
  let expenseRows = [...cogsRows, ...opexRows];
  const fromPres = presentationHost ? plRowsFromPresentationSections(presentationHost) : null;
  if (fromPres) {
    if (!incomeRows.length && fromPres.incomeRows.length) incomeRows = fromPres.incomeRows;
    if (!expenseRows.length && fromPres.expenseRows.length) expenseRows = fromPres.expenseRows;
  }
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

/** Axios body or nested `{ data }` / `{ success, data }` from finance statement endpoints. */
export function unwrapFinancePayload(data) {
  if (!data || typeof data !== 'object') return data;
  let d = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data;
  if (d && typeof d === 'object' && d.success === true && d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
    d = d.data;
  }
  return d;
}

/**
 * Direct-method operating section: inflows minus explicit paid lines (do not sum all numeric fields).
 */
function readOperatingNetFromDirectMethod(section) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
  const keys = [
    'cash_received_from_customers',
    'cash_paid_to_suppliers',
    'cash_paid_for_expenses',
    'cash_paid_for_operating_expenses',
    'interest_paid',
    'income_taxes_paid',
  ];
  const has = keys.some((k) => {
    const v = section[k];
    return v != null && Number.isFinite(Number(v));
  });
  if (!has) return null;
  return (
    (Number(section.cash_received_from_customers) || 0) -
    (Number(section.cash_paid_to_suppliers) || 0) -
    (Number(section.cash_paid_for_expenses) || 0) -
    (Number(section.cash_paid_for_operating_expenses) || 0) -
    (Number(section.interest_paid) || 0) -
    (Number(section.income_taxes_paid) || 0)
  );
}

/**
 * Net for operating / investing / financing when API omits `total` and `net` but sends numeric line fields
 * (e.g. `cash_received_from_customers`) or `inflows` / `outflows`.
 */
function readCashflowActivitiesNet(section) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
  if (section.total != null && Number.isFinite(Number(section.total))) return Number(section.total) || 0;
  if (section.net != null && Number.isFinite(Number(section.net))) return Number(section.net) || 0;
  if (section.inflows != null || section.outflows != null) {
    const inf = Number(section.inflows);
    const outf = Number(section.outflows);
    if (Number.isFinite(inf) || Number.isFinite(outf)) {
      return (Number.isFinite(inf) ? inf : 0) - (Number.isFinite(outf) ? outf : 0);
    }
  }
  const skip = new Set(['breakdown', 'transactions', 'transaction_details', 'transaction_count']);
  let sum = 0;
  let any = false;
  for (const [k, v] of Object.entries(section)) {
    if (skip.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

export function cashflowStatementMetrics(data) {
  const d = unwrapFinancePayload(data);
  if (!d || typeof d !== 'object') {
    return { operating: 0, investing: 0, financing: 0, netChange: 0, openingCash: 0, closingCash: 0 };
  }
  const inflowT = d.cash_inflow?.total;
  const outflowT = d.cash_outflow?.total;
  const operatingFromCashIO =
    inflowT != null && outflowT != null
      ? (Number(inflowT) || 0) - (Number(outflowT) || 0)
      : null;
  const operatingFromDirectMethod = readOperatingNetFromDirectMethod(d.operating_activities);
  const operatingFromActivities = readCashflowActivitiesNet(d.operating_activities);
  const operating = Number(
    d.operating?.total ??
      d.operating_activities?.total ??
      d.operating_activities?.net ??
      (operatingFromCashIO != null ? operatingFromCashIO : null) ??
      operatingFromDirectMethod ??
      operatingFromActivities ??
      0
  ) || 0;
  const investing = Number(
    d.investing?.total ??
      d.investing_activities?.total ??
      d.investing_activities?.net ??
      readCashflowActivitiesNet(d.investing_activities) ??
      0
  ) || 0;
  const financing = Number(
    d.financing?.total ??
      d.financing_activities?.total ??
      d.financing_activities?.net ??
      readCashflowActivitiesNet(d.financing_activities) ??
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
  const d = unwrapFinancePayload(data);
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

/**
 * APIs often send payment / purchase lines as positive magnitudes. Map to signed cash flow
 * so UI can split inflows (>= 0) vs outflows (< 0).
 * @param {string} key
 * @param {number} raw
 * @param {'operating' | 'investing' | 'financing' | null | undefined} section
 */
function signedCashflowLineAmount(key, raw, section) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return n;
  const k = String(key).toLowerCase();
  if (!section) return n;

  if (section === 'operating') {
    if (
      /(received|receipt|inflow|from_customers|customers|advance_received|interest_received|dividends_received)/i.test(k) &&
      !/(paid|purchase|expense|supplier)/i.test(k)
    ) {
      return n < 0 ? -Math.abs(n) : n;
    }
    if (
      /(paid|payable|purchase|supplier|suppliers|expense|outflow|tax|wage|salary|cost|interest_paid|dividend_paid|refund_paid|repayment)/i.test(k) ||
      /(individual_expenses|operating_expenses|cash_paid)/i.test(k)
    ) {
      return n > 0 ? -Math.abs(n) : n;
    }
    return n;
  }

  if (section === 'investing') {
    if (
      /(proceeds|from_sale|sale_of|disposal|maturity|inflow|received|recovery)/i.test(k) &&
      !/(purchase|paid|loans_given|loan_to)/i.test(k)
    ) {
      return n < 0 ? Math.abs(n) : n;
    }
    if (/(purchase|equipment|building|loans_given|loan_to|acquisition|capital_expenditure|outflow|investment_in)/i.test(k)) {
      return n > 0 ? -Math.abs(n) : n;
    }
    return n;
  }

  if (section === 'financing') {
    if (/(repayment|paid|dividend|redemption|buyback|outflow|distribution|withdrawal)/i.test(k)) {
      return n > 0 ? -Math.abs(n) : n;
    }
    if (/(contribution|proceeds|borrowing|loan|inflow|issued|capital)/i.test(k)) {
      return n < 0 ? Math.abs(n) : n;
    }
    return n;
  }

  return n;
}

function normalizeCashflowRows(value, { section } = {}) {
  const CASHFLOW_LABEL_OVERRIDES = {
    netIncome: 'Rent paid',
  };
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((r, i) => {
        const key = r.key ?? r.code ?? r.accountCode ?? r.name ?? r.label ?? `row_${i}`;
        const label = r.label ?? r.name ?? r.accountName ?? CASHFLOW_LABEL_OVERRIDES[String(key)] ?? toTitleFromKey(key);
        const raw = Number(r.amount ?? r.value ?? r.total ?? 0);
        if (!Number.isFinite(raw)) return null;
        const amount = signedCashflowLineAmount(String(key), raw, section);
        const accountCodes = plLineCollectAccountCodes(r, String(key));
        return {
          key: String(key),
          label: String(label),
          amount,
          ...(accountCodes?.length ? { accountCodes } : {}),
        };
      })
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    const skipAgg =
      section && ['operating', 'investing', 'financing'].includes(section)
        ? new Set(['total', 'net', 'inflows', 'outflows', 'transaction_count'])
        : new Set(['total']);
    return Object.entries(value)
      .filter(([k, v]) => !skipAgg.has(k) && Number.isFinite(Number(v)))
      .map(([k, v]) => {
        const raw = Number(v) || 0;
        const amount = signedCashflowLineAmount(String(k), raw, section);
        const ks = String(k).trim();
        const codeExtra = isPlGlAccountCodeString(ks) ? { accountCodes: [ks] } : {};
        return {
          key: String(k),
          label: CASHFLOW_LABEL_OVERRIDES[String(k)] ?? toTitleFromKey(k),
          amount,
          ...codeExtra,
        };
      });
  }
  return [];
}

const DETAILED_INCOME_SKIP = new Set([
  'total',
  'categories',
  'by_source',
  'by_month',
  'by_residence',
  'payment_details',
  'advance_payments',
  'payments',
  'transaction_details',
  'transaction_count',
  'metadata',
]);

const DETAILED_EXPENSE_SKIP = new Set([
  'total',
  'total_amount',
  'total_count',
  'expenses',
  'expenses_detail',
  'by_month',
  'by_residence',
  'by_account',
  'by_type',
  'transaction_details',
  'metadata',
  'categories',
]);

/** Strip trailing " — detail" so similar lines aggregate (e.g. all booking payments). */
function stemBeforeDelimiter(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = t.match(/^(.+?)\s*[—–-]\s+.+/u);
  return (m ? m[1] : t).trim();
}

function cashflowShortHash(str) {
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 8);
}

function slugBaseFromGroupKey(gk, max = 40) {
  return String(gk || 'other')
    .toLowerCase()
    .replace(/^(in|t|d|s|f):/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max) || 'grp';
}

function inflowGroupKeyFromRow(p) {
  const desc = String(p.description ?? '').trim();
  const src = String(p.source ?? '').trim();
  const primary = desc || src;
  const stem = stemBeforeDelimiter(primary).toLowerCase();
  if (stem.length >= 2) return `in:${stem.slice(0, 140)}`;
  return `in:${primary.slice(0, 100).toLowerCase()}`;
}

function inflowDisplayLabel(_gk, sample) {
  const desc = String(sample?.description ?? '').trim();
  const src = String(sample?.source ?? '').trim();
  return stemBeforeDelimiter(desc || src) || src || desc || 'Cash received';
}

/** Numeric GL / account code on statement lines (3+ digits; many COAs use 3–5 digit codes). */
function isPlGlAccountCodeString(c) {
  return /^\d{3,}$/.test(String(c ?? '').trim());
}

function addGlCodeToSet(set, val) {
  const c = String(val ?? '').trim();
  if (isPlGlAccountCodeString(c)) set.add(c);
}

/** Pull GL codes from a P&amp;L line object (legacy rows or structured map values). */
function addPlLineAccountFieldsToSet(set, obj) {
  if (!obj || typeof obj !== 'object') return;
  addGlCodeToSet(set, obj.account_code ?? obj.accountCode);
  addGlCodeToSet(set, obj.revenueAccountCode ?? obj.revenue_account_code);
  addGlCodeToSet(set, obj.expenseAccountCode ?? obj.expense_account_code);
  addGlCodeToSet(set, obj.debitAccountCode ?? obj.debit_account_code);
  addGlCodeToSet(set, obj.creditAccountCode ?? obj.credit_account_code);
  addGlCodeToSet(set, obj.receivableAccountCode ?? obj.receivable_account_code);
  addGlCodeToSet(set, obj.payableAccountCode ?? obj.payable_account_code);
  addGlCodeToSet(set, obj.assetAccountCode ?? obj.asset_account_code);
  addGlCodeToSet(set, obj.liabilityAccountCode ?? obj.liability_account_code);
  addGlCodeToSet(set, obj.bankAccountCode ?? obj.bank_account_code);
  addGlCodeToSet(set, obj.cashAccountCode ?? obj.cash_account_code);
  addGlCodeToSet(set, obj.code);
  addGlCodeToSet(set, obj.key);
  const acc = obj.account ?? obj.glAccount ?? obj.gl_account;
  if (acc && typeof acc === 'object') {
    addGlCodeToSet(set, acc.code ?? acc.accountCode ?? acc.account_code);
  } else if (typeof acc === 'string') {
    addGlCodeToSet(set, acc);
  }
}

/** GL codes from a P&amp;L API line (legacy `income` / `expense` arrays). */
function plLineCollectAccountCodes(row, hintKey) {
  if (!row || typeof row !== 'object') return undefined;
  const codes = new Set();
  addPlLineAccountFieldsToSet(codes, row);
  if (hintKey) addGlCodeToSet(codes, hintKey);
  if (!codes.size) return undefined;
  return [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * One revenue/cogs/opex map entry → statement row with optional `accountCodes`.
 * @param {string} k - map key
 * @param {unknown} v - number or `{ amount?, accountCode?, ... }`
 * @param {string} keyPrefix - e.g. `cogs_`, `opex_`, or `''` for revenue
 */
function plStructuredPlRow(k, v, keyPrefix) {
  const ks = String(k).trim();
  if (ks === 'total') return null;
  const codes = new Set();
  let amount = NaN;
  if (v != null && typeof v === 'object' && !Array.isArray(v)) {
    amount = Number(v.amount ?? v.value ?? v.total ?? v.balance ?? 0);
    addPlLineAccountFieldsToSet(codes, v);
    addGlCodeToSet(codes, ks);
  } else if (Number.isFinite(Number(v))) {
    amount = Number(v) || 0;
    addGlCodeToSet(codes, ks);
  } else {
    return null;
  }
  if (!Number.isFinite(amount)) return null;
  const key = keyPrefix ? `${keyPrefix}${ks}` : ks;
  const accountCodes = codes.size ? [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : undefined;
  return {
    key,
    label: toTitleFromKey(k),
    amount,
    ...(accountCodes?.length ? { accountCodes } : {}),
  };
}

function aggregateCashflowInflowRows(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const map = new Map();
  for (const p of list) {
    const amt = Number(p.amount) || 0;
    if (!amt) continue;
    const gk = inflowGroupKeyFromRow(p);
    const cur = map.get(gk) ?? { total: 0, sample: null, codes: new Set() };
    cur.total += amt;
    addGlCodeToSet(cur.codes, p.accountCode ?? p.account_code);
    addGlCodeToSet(cur.codes, p.revenueAccountCode ?? p.revenue_account_code);
    addGlCodeToSet(cur.codes, p.cashAccountCode ?? p.cash_account_code);
    if (cur.sample == null) cur.sample = p;
    map.set(gk, cur);
  }
  const out = [];
  for (const [gk, { total, sample, codes }] of map) {
    const slug = slugBaseFromGroupKey(gk);
    const h = cashflowShortHash(gk);
    const accountCodes = codes && codes.size ? [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : undefined;
    out.push({
      key: `dbd_inc_grp_${slug}_${h}`,
      label: inflowDisplayLabel(gk, sample),
      amount: signedCashflowLineAmount('cash_received_from_customers', total, 'operating'),
      ...(accountCodes?.length ? { accountCodes } : {}),
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

function outflowGroupKeyFromRow(e) {
  const type = String(e.type ?? e.category ?? '').trim();
  const desc = String(e.description ?? '').trim();
  if (type) return `t:${type.toLowerCase()}`;
  const parts = desc.split(/\s*[—–-]\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1].toLowerCase();
    if (tail.length >= 2 && tail.length <= 160) return `d:${tail}`;
  }
  const stem = stemBeforeDelimiter(desc).toLowerCase();
  if (stem.length >= 2) return `s:${stem.slice(0, 140)}`;
  return `f:${desc.slice(0, 120).toLowerCase()}`;
}

function outflowDisplayLabel(_gk, sample) {
  const type = String(sample?.type ?? sample?.category ?? '').trim();
  if (type) return type;
  const desc = String(sample?.description ?? '').trim();
  const parts = desc.split(/\s*[—–-]\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return stemBeforeDelimiter(desc) || 'Operating outflow';
}

function aggregateCashflowOutflowRows(lineList) {
  if (!Array.isArray(lineList) || lineList.length === 0) return [];
  const map = new Map();
  for (const e of lineList) {
    const raw = Number(e.amount ?? e.total ?? e.value) || 0;
    if (!raw) continue;
    const mag = Math.abs(raw);
    const gk = outflowGroupKeyFromRow(e);
    const cur = map.get(gk) ?? { total: 0, sample: null, codes: new Set() };
    cur.total += mag;
    addGlCodeToSet(cur.codes, e.account_code ?? e.accountCode);
    addGlCodeToSet(cur.codes, e.expenseAccountCode ?? e.expense_account_code);
    if (cur.sample == null) cur.sample = e;
    map.set(gk, cur);
  }
  const out = [];
  for (const [gk, { total, sample, codes }] of map) {
    const slug = slugBaseFromGroupKey(gk);
    const h = cashflowShortHash(gk);
    const accountCodes = codes && codes.size ? [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : undefined;
    out.push({
      key: `dbd_exp_grp_${slug}_${h}`,
      label: outflowDisplayLabel(gk, sample),
      amount: signedCashflowLineAmount('cash_paid_for_expenses', -Math.abs(total), 'operating'),
      ...(accountCodes?.length ? { accountCodes } : {}),
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

function incomeRowsFromDetailedBreakdown(d) {
  const db = d?.detailed_breakdown;
  if (!db || typeof db !== 'object') return [];
  const income = db.income;
  if (!income || typeof income !== 'object' || Array.isArray(income)) return [];

  const rows = [];
  const paySrc =
    (Array.isArray(income.payment_details) && income.payment_details.length > 0
      ? income.payment_details
      : null) ??
    (Array.isArray(db.payments) && db.payments.length > 0 ? db.payments : null);

  if (paySrc) {
    rows.push(...aggregateCashflowInflowRows(paySrc));
    return rows;
  }

  if (Array.isArray(income.categories) && income.categories.length > 0) {
    income.categories.forEach((r, i) => {
      const key = String(r.category ?? r._id ?? r.code ?? `inc_cat_${i}`);
      const label = String(r.label ?? r.name ?? r.category ?? toTitleFromKey(key));
      const raw = Number(r.total ?? r.amount ?? r.value ?? 0);
      if (!Number.isFinite(raw) || raw === 0) return;
      rows.push({
        key: `dbd_inc_${key}_${i}`,
        label,
        amount: signedCashflowLineAmount(key, raw, 'operating'),
      });
    });
    return rows;
  }

  const bySource = income.by_source;
  if (bySource && typeof bySource === 'object' && !Array.isArray(bySource)) {
    for (const [k, v] of Object.entries(bySource)) {
      const raw = Number(v) || 0;
      if (!raw) continue;
      rows.push({
        key: `dbd_inc_${k}`,
        label: toTitleFromKey(k),
        amount: signedCashflowLineAmount(k, raw, 'operating'),
      });
    }
    return rows;
  }

  for (const [k, v] of Object.entries(income)) {
    if (DETAILED_INCOME_SKIP.has(k)) continue;
    if (!Number.isFinite(Number(v))) continue;
    const raw = Number(v) || 0;
    if (raw === 0) continue;
    rows.push({
      key: `dbd_inc_${k}`,
      label: toTitleFromKey(k),
      amount: signedCashflowLineAmount(k, raw, 'operating'),
    });
  }
  return rows;
}

function expenseRowsFromDetailedBreakdown(d) {
  const db = d?.detailed_breakdown;
  if (!db || typeof db !== 'object') return [];
  const expenses = db.expenses;
  if (!expenses || typeof expenses !== 'object' || Array.isArray(expenses)) return [];

  const rows = [];
  const lineList =
    Array.isArray(expenses.expenses) && expenses.expenses.length > 0
      ? expenses.expenses
      : Array.isArray(expenses.expenses_detail) && expenses.expenses_detail.length > 0
        ? expenses.expenses_detail
        : [];

  if (lineList.length > 0) {
    rows.push(...aggregateCashflowOutflowRows(lineList));
    return rows;
  }

  const byAcc = expenses.by_account;
  if (byAcc && typeof byAcc === 'object' && !Array.isArray(byAcc)) {
    const accEntries = Object.entries(byAcc)
      .map(([k, v]) => {
        if (!v || typeof v !== 'object') return null;
        const raw = Number(v.amount ?? v.value ?? 0);
        if (!raw) return null;
        const code = String(v.accountCode ?? v.account_code ?? k);
        const name = v.accountName ?? v.account_name ?? code;
        return { code, name, raw };
      })
      .filter(Boolean);
    accEntries.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const { code, name, raw } of accEntries) {
      const c = String(code).trim();
      rows.push({
        key: `dbd_exp_acc_${code}`,
        label: String(name),
        amount: signedCashflowLineAmount('cash_paid_for_expenses', -Math.abs(raw), 'operating'),
        ...(isPlGlAccountCodeString(c) ? { accountCodes: [c] } : {}),
      });
    }
    if (rows.length > 0) return rows;
  }

  for (const [k, v] of Object.entries(expenses)) {
    if (DETAILED_EXPENSE_SKIP.has(k)) continue;
    if (!Number.isFinite(Number(v))) continue;
    const raw = Number(v) || 0;
    if (raw === 0) continue;
    const label = /^\d+$/.test(k) ? `Account ${k}` : toTitleFromKey(k);
    const ks = String(k).trim();
    rows.push({
      key: `dbd_exp_${k}`,
      label,
      amount: signedCashflowLineAmount(`cash_paid_${k}`, -Math.abs(raw), 'operating'),
      ...(isPlGlAccountCodeString(ks) ? { accountCodes: [ks] } : {}),
    });
  }
  return rows;
}

/**
 * Operating cash lines from `detailed_breakdown` (income + expenses) so the statement matches API v3 shapes.
 */
function operatingRowsFromDetailedBreakdown(d) {
  return [...incomeRowsFromDetailedBreakdown(d), ...expenseRowsFromDetailedBreakdown(d)];
}

/** When `detailed_breakdown` is absent or empty, use `operating_activities.income_breakdown` / `individual_expenses`. */
function operatingRowsFromOperatingActivitiesBreakdown(d) {
  const oa = d?.operating_activities;
  if (!oa || typeof oa !== 'object' || Array.isArray(oa)) return [];
  const rows = [];

  const incBreak = oa.income_breakdown;
  if (incBreak && typeof incBreak === 'object' && !Array.isArray(incBreak)) {
    const allInflowTxs = [];
    for (const [bucketKey, bucket] of Object.entries(incBreak)) {
      if (!bucket || typeof bucket !== 'object') continue;
      const txs = bucket.transactions;
      if (Array.isArray(txs) && txs.length > 0) {
        for (const p of txs) {
          allInflowTxs.push({
            ...p,
            source: p.source ?? bucketKey,
          });
        }
      } else {
        const t = Number(bucket.total) || 0;
        if (!t) continue;
        allInflowTxs.push({
          amount: t,
          description: toTitleFromKey(bucketKey),
          source: bucketKey,
          transactionId: `tot_${bucketKey}`,
        });
      }
    }
    rows.push(...aggregateCashflowInflowRows(allInflowTxs));
  }

  let expenseList = [];
  const indiv = oa.individual_expenses;
  if (Array.isArray(indiv) && indiv.length > 0) {
    expenseList = indiv;
  } else {
    const eb = oa.expense_breakdown;
    if (eb && typeof eb === 'object' && !Array.isArray(eb)) {
      for (const [, group] of Object.entries(eb)) {
        if (group && typeof group === 'object' && Array.isArray(group.expenses)) {
          expenseList.push(...group.expenses);
        }
      }
    }
  }
  rows.push(...aggregateCashflowOutflowRows(expenseList));

  return rows;
}

/** Prefer nested `breakdown` map when API sends both roll-ups and detail. */
function normalizeCashflowSectionWithBreakdown(section, sectionName) {
  if (Array.isArray(section)) return normalizeCashflowRows(section, { section: sectionName });
  if (!section || typeof section !== 'object') return [];
  const bd = section.breakdown;
  if (bd && typeof bd === 'object' && !Array.isArray(bd)) {
    const fromBd = normalizeCashflowRows(bd, { section: sectionName });
    if (fromBd.some((r) => Number(r.amount) !== 0)) return fromBd;
  }
  return normalizeCashflowRows(section.lines ?? section, { section: sectionName });
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
      const ac = isPlGlAccountCodeString(code) ? { accountCodes: [code] } : {};
      out.push({ key, label: String(label || code), amount: bal, ...ac });
    }
  }
  addFromMap(d.cash_balance_by_account);
  const nested =
    d.cash_accounts?.breakdown ?? d.cash_accounts?.accounts ?? d.cash_accounts?.by_account;
  if (nested && typeof nested === 'object') addFromMap(nested);
  return out;
}

export function cashflowDetailedSections(data) {
  const d = unwrapFinancePayload(data);
  const metrics = cashflowStatementMetrics(d);
  const skipOperatingAggRows =
    (Array.isArray(d?.cash_inflow?.categories) && d.cash_inflow.categories.length > 0) ||
    (Array.isArray(d?.cash_outflow?.categories) && d.cash_outflow.categories.length > 0);
  const fromDetailed = operatingRowsFromDetailedBreakdown(d);
  const fromOperatingActivities =
    fromDetailed.length === 0 ? operatingRowsFromOperatingActivitiesBreakdown(d) : [];
  const operating =
    fromDetailed.length > 0
      ? fromDetailed
      : fromOperatingActivities.length > 0
        ? fromOperatingActivities
        : normalizeCashflowRows(
            d?.operating?.lines ??
              d?.operating ??
              d?.operating_activities?.lines ??
              (!skipOperatingAggRows ? d?.operating_activities : null) ??
              d?.detailed_breakdown?.income?.categories,
            { section: 'operating' }
          );
  const cashInByCategory = Array.isArray(d?.byCategory?.cashIn)
    ? d.byCategory.cashIn.map((r) => {
        const accountCodes = plLineCollectAccountCodes(r);
        return {
          key: `cashIn_${r.category ?? r._id ?? 'other'}`,
          label: toTitleFromKey(r.category ?? r._id ?? 'cash in'),
          amount: Number(r.total ?? r.amount ?? 0) || 0,
          ...(accountCodes?.length ? { accountCodes } : {}),
        };
      })
    : [];
  const cashOutByCategory = Array.isArray(d?.byCategory?.cashOut)
    ? d.byCategory.cashOut.map((r) => {
        const accountCodes = plLineCollectAccountCodes(r);
        return {
          key: `cashOut_${r.category ?? r._id ?? 'other'}`,
          label: toTitleFromKey(r.category ?? r._id ?? 'cash out'),
          amount: -(Math.abs(Number(r.total ?? r.amount ?? 0) || 0)),
          ...(accountCodes?.length ? { accountCodes } : {}),
        };
      })
    : [];
  const cashInflowCategories = Array.isArray(d?.cash_inflow?.categories)
    ? d.cash_inflow.categories.map((r) => {
        const accountCodes = plLineCollectAccountCodes(r);
        return {
          key: `cashIn_${r.category ?? r._id ?? 'other'}`,
          label: toTitleFromKey(r.category ?? r._id ?? 'cash in'),
          amount: Number(r.total ?? r.amount ?? 0) || 0,
          ...(accountCodes?.length ? { accountCodes } : {}),
        };
      })
    : [];
  const cashOutflowCategories = Array.isArray(d?.cash_outflow?.categories)
    ? d.cash_outflow.categories.map((r) => {
        const accountCodes = plLineCollectAccountCodes(r);
        return {
          key: `cashOut_${r.category ?? r._id ?? 'other'}`,
          label: toTitleFromKey(r.category ?? r._id ?? 'cash out'),
          amount: -(Math.abs(Number(r.total ?? r.amount ?? 0) || 0)),
          ...(accountCodes?.length ? { accountCodes } : {}),
        };
      })
    : [];
  // Use a single operating breakdown source to avoid duplicate counting.
  // Some payloads include both `operating` lines and category summaries for the same cash movement.
  const operatingMerged =
    operating.length > 0
      ? operating
      : cashInflowCategories.length > 0 || cashOutflowCategories.length > 0
        ? [...cashInflowCategories, ...cashOutflowCategories]
        : [...cashInByCategory, ...cashOutByCategory];
  const operatingIncome = operatingMerged.filter((r) => r.amount >= 0);
  const operatingExpense = operatingMerged.filter((r) => r.amount < 0);
  const investing = normalizeCashflowSectionWithBreakdown(
    d?.investing?.lines ??
      d?.investing ??
      d?.investing_activities?.lines ??
      d?.investing_activities,
    'investing'
  );
  const financing = normalizeCashflowSectionWithBreakdown(
    d?.financing?.lines ??
      d?.financing ??
      d?.financing_activities?.lines ??
      d?.financing_activities,
    'financing'
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
  return (
    row.description ??
    row.accountName ??
    row.account_name ??
    row.category ??
    row.name ??
    row.label ??
    '—'
  );
}

export function rowAmount(row) {
  const n = row.amount ?? row.value ?? row.balance;
  return n != null && Number.isFinite(Number(n)) ? Number(n) : 0;
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
  if (v.amount == null && v.value == null && v.balance == null) return false;
  const amt = Number(v.amount ?? v.value ?? v.balance);
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
        const amount = Number(v.amount ?? v.value ?? v.balance ?? 0) || 0;
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
        const amount = Number(v.amount ?? v.value ?? v.balance ?? 0) || 0;
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

/** double_entry_v3 style: section arrays of { accountCode, accountName, accountType?, balance } */
function mapBalanceSheetAccountArray(arr, sectionKey, sectionLabel) {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => {
    if (!v || typeof v !== 'object') return null;
    const amount = Number(v.balance ?? v.amount ?? v.value ?? 0) || 0;
    return {
      section: sectionLabel,
      group: sectionLabel,
      type: v.accountType || v.account_type || sectionKey,
      code: String(v.accountCode ?? v.account_code ?? v.code ?? ''),
      name: String(v.accountName ?? v.account_name ?? v.name ?? '—'),
      category: v.category ?? '—',
      amount,
    };
  }).filter(Boolean);
}

/**
 * Normalize balance-sheet payload to line-item rows.
 * Supports:
 * - array rows
 * - { items | lineItems }
 * - double_entry_v3: { assets, liabilities, equity } as **arrays** of account lines (balance field)
 * - structured object { assets, liabilities, equity } as nested **objects** (legacy)
 */
export function normalizeBalanceSheetRows(data) {
  if (Array.isArray(data)) return data;
  let d = data && typeof data === 'object' && data.data && !Array.isArray(data.data) ? data.data : data;
  if (!d || typeof d !== 'object') return [];
  if (d.accounting && typeof d.accounting === 'object' && !Array.isArray(d.accounting)) {
    d = d.accounting;
  }
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.lineItems)) return d.lineItems;

  const hasArraySections =
    Array.isArray(d.assets) || Array.isArray(d.liabilities) || Array.isArray(d.equity);
  if (hasArraySections) {
    const out = [];
    out.push(...mapBalanceSheetAccountArray(d.assets, 'assets', 'Assets'));
    out.push(...mapBalanceSheetAccountArray(d.liabilities, 'liabilities', 'Liabilities'));
    out.push(...mapBalanceSheetAccountArray(d.equity, 'equity', 'Equity'));
    return out;
  }

  // Presentation-first shape:
  // { presentation: { sections: [ { key, label, lines:[{accountCode, accountName, balance}] } ] } }
  const sections =
    d.presentation && typeof d.presentation === 'object' && Array.isArray(d.presentation.sections)
      ? d.presentation.sections
      : null;
  if (sections && sections.length > 0) {
    const out = [];
    for (const sec of sections) {
      const sectionLabel = sec?.label || toTitleFromKey(sec?.key || '');
      const sectionKey = String(sec?.key || '').toLowerCase();
      const lines = Array.isArray(sec?.lines) ? sec.lines : [];
      out.push(...mapBalanceSheetAccountArray(lines, sectionKey || 'other', sectionLabel || 'Section'));
    }
    return out;
  }

  const out = [];
  if (d.assets) pushObjectRows(out, 'Assets', 'Assets', d.assets, 'assets');
  if (d.liabilities) pushObjectRows(out, 'Liabilities', 'Liabilities', d.liabilities, 'liabilities');
  if (d.equity) pushObjectRows(out, 'Equity', 'Equity', d.equity, 'equity');
  return out;
}

/**
 * Section totals for APIs that send totalAssets / totalLiabilities / totalEquity on the payload root.
 */
export function readDoubleEntryBalanceSheetTotals(d) {
  if (!d || typeof d !== 'object') return null;
  const src =
    d.accounting && typeof d.accounting === 'object' && !Array.isArray(d.accounting)
      ? d.accounting
      : d;
  const pres =
    src.presentation && typeof src.presentation === 'object' && !Array.isArray(src.presentation)
      ? src.presentation
      : null;
  const a = src.totalAssets ?? pres?.totalAssets;
  const l = src.totalLiabilities ?? pres?.totalLiabilities;
  const e = src.totalEquity ?? pres?.totalEquity;
  if (a == null && l == null && e == null) return null;
  return {
    assets: a != null ? Number(a) : null,
    liabilities: l != null ? Number(l) : null,
    equity: e != null ? Number(e) : null,
  };
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
