import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getTransactions } from '@/api/finance';
import { getAccounts, createAccount, updateAccount, getJournalEntries } from '@/api/accounting';
import { ACCOUNT_OPTIONS } from '@/constants/financeAccounts';
import { transactionCategoryLabel } from '@/constants/transactionCategories';
import { formatTransactionMutationMessage } from '@/utils/apiError';
import { parseLocalDate } from '@/utils/availability';
import { formatDateDayMonthYear } from '@/utils/formatDate';
import {
  getTransactionRowDebitCreditNet,
  getTransactionDebitCreditAccounts,
} from '@/utils/transactionLedgerUi';
import { normalizeTransactionsFetchResult } from '@/utils/transactionsResponse';
import { flattenJournalEntriesToLines } from '@/utils/journalEntriesNormalize';
import { normalizeAccountsFromResponse, labelFromConstantsAccount as labelFromConstants } from '@/utils/accountsFromApi';
import {
  transactionsForCoaLedger,
  journalLineTouchesAccount,
  journalLineNetForAccount,
  counterpartyJournalLine,
  getJournalLineDebitCredit,
  getJournalLineAccountCode,
} from '@/utils/coaLedgerMerge';

const TX_LIMIT = 500;
const JOURNAL_LIMIT = 500;
/** Page 1, no date/category filters — same API contract as Transactions page, larger page size for COA activity. */
const TX_PAGE = 1;

/** Backend enum: `type` must be ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE. */
const ACCOUNT_TYPE_OPTIONS = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
];

const COA_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All types' },
  ...ACCOUNT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

const NORMAL_BALANCE_OPTIONS = [
  { value: 'DEBIT', label: 'Debit-normal (typical assets & expenses)' },
  { value: 'CREDIT', label: 'Credit-normal (typical liabilities, equity, revenue)' },
];

function defaultAccountForm() {
  return {
    code: '',
    autoCode: false,
    name: '',
    type: 'ASSET',
    subType: '',
    normalBalance: 'DEBIT',
    openingBalance: '',
    openingAsOf: '',
    openingBalanceNote: '',
  };
}

function formatTableDate(val) {
  if (val == null || val === '') return '—';
  const parsed = parseLocalDate(val);
  if (parsed) return formatDateDayMonthYear(parsed);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : formatDateDayMonthYear(d);
}

/** Human-readable category column (API subType or category). */
function accountCategoryDisplay(a) {
  const rawCat = a?.category ?? a?.accountCategory ?? a?.account_category;
  if (rawCat != null && String(rawCat).trim()) {
    return humanizeLabel(String(rawCat).trim());
  }
  const st = a?.subType ?? a?.sub_type;
  if (st != null && String(st).trim()) return humanizeLabel(String(st).trim());
  return '—';
}

function humanizeLabel(s) {
  return s
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function moneyOrBlank(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return 'R ' + Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

function transactionTouchesAccount(t, code) {
  const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
  return debitCode === code || creditCode === code;
}

/** Net effect on account for one transaction (debits increase, credits decrease). */
function accountLineNet(t, code) {
  const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
  const { rowDebit, rowCredit } = getTransactionRowDebitCreditNet(t);
  let n = 0;
  if (debitCode === code) n += Number(rowDebit) || 0;
  if (creditCode === code) n -= Number(rowCredit) || 0;
  return n;
}

function counterpartyLine(t, glCode) {
  const acct = getTransactionDebitCreditAccounts(t);
  const debitCode = acct.debitCode;
  const creditCode = acct.creditCode;
  if (debitCode === glCode) {
    const nm = acct.creditName || labelFromConstants(creditCode);
    return creditCode ? `${nm} (${creditCode})` : nm;
  }
  if (creditCode === glCode) {
    const nm = acct.debitName || labelFromConstants(debitCode);
    return debitCode ? `${nm} (${debitCode})` : nm;
  }
  return '—';
}

function accountListRowKey(a) {
  if (a?.code != null && String(a.code).trim() !== '') return String(a.code).trim();
  if (a?.id != null) return `id:${a.id}`;
  return '';
}

function sameAccountRow(a, b) {
  if (!a || !b) return false;
  if (a.id != null && b.id != null) return String(a.id) === String(b.id);
  const ca = a.code != null ? String(a.code).trim() : '';
  const cb = b.code != null ? String(b.code).trim() : '';
  return ca !== '' && ca === cb;
}

function compareChartRows(a, b) {
  const ca = a.code != null ? String(a.code) : '\uffff';
  const cb = b.code != null ? String(b.code) : '\uffff';
  return ca.localeCompare(cb, undefined, { numeric: true });
}

const ACCOUNT_TYPE_LABEL = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  EXPENSE: 'Expense',
};

function accountTypeShortLabel(t) {
  const u = String(t || '').toUpperCase();
  return ACCOUNT_TYPE_LABEL[u] || (t ? String(t) : '—');
}

export default function ChartOfAccountsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const readOnly = user?.role === 'ceo';
  const financeBase = pathname.startsWith('/ceo') ? '/ceo' : '/finance';
  const [coaSearch, setCoaSearch] = useState('');
  const [coaTypeFilter, setCoaTypeFilter] = useState('');
  /** Account whose ledger is shown in the View (eye) modal. */
  const [ledgerModalAccount, setLedgerModalAccount] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [openingModal, setOpeningModal] = useState(null);
  const [form, setForm] = useState(defaultAccountForm);
  const [openingForm, setOpeningForm] = useState({ amount: '', asOf: '', note: '' });
  const [saveError, setSaveError] = useState(null);
  const [openingSaveError, setOpeningSaveError] = useState(null);

  const accountsQuery = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: async () => {
      const res = await getAccounts();
      return normalizeAccountsFromResponse(res);
    },
    retry: false,
  });

  const transactionsQuery = useQuery({
    queryKey: ['transactions', 'chart-of-accounts', TX_PAGE, TX_LIMIT, '', '', ''],
    queryFn: async () => {
      const res = await getTransactions({ page: TX_PAGE, limit: TX_LIMIT, includeByAccount: 0 });
      return normalizeTransactionsFetchResult(res);
    },
  });

  const journalQuery = useQuery({
    queryKey: ['accounting', 'journal-entries', 'chart-of-accounts', JOURNAL_LIMIT],
    queryFn: async () => {
      try {
        const res = await getJournalEntries({ page: 1, limit: JOURNAL_LIMIT });
        return res?.data !== undefined ? res.data : res;
      } catch (e) {
        if (e?.response?.status === 404) return [];
        throw e;
      }
    },
    retry: false,
  });

  const txList = useMemo(
    () => transactionsQuery.data?.list ?? [],
    [transactionsQuery.data]
  );

  const journalLines = useMemo(
    () => flattenJournalEntriesToLines(journalQuery.data),
    [journalQuery.data]
  );

  const txForCoaLedger = useMemo(
    () => transactionsForCoaLedger(txList, journalLines),
    [txList, journalLines]
  );

  const codesFromActivity = useMemo(() => {
    const set = new Set();
    for (const t of txList) {
      const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
      if (debitCode) set.add(debitCode);
      if (creditCode) set.add(creditCode);
    }
    for (const j of journalLines) {
      const c = getJournalLineAccountCode(j);
      if (c) set.add(c);
    }
    return set;
  }, [txList, journalLines]);

  const accountsList = useMemo(() => {
    const map = new Map();
    const fromApi = Array.isArray(accountsQuery.data) ? accountsQuery.data : [];
    if (fromApi.length > 0) {
      fromApi.forEach((a) => map.set(a.code || `__id_${a.id}`, { ...a }));
    } else {
      ACCOUNT_OPTIONS.forEach((o) => {
        map.set(o.value, {
          code: o.value,
          name: o.label.replace(/^\d+\s*-\s*/, '').trim() || o.label,
          type: '',
          subType: null,
          category: null,
          normalBalance: null,
          id: null,
          openingBalance: null,
          openingAsOf: null,
          openingBalanceNote: null,
        });
      });
    }
    codesFromActivity.forEach((code) => {
      if (!map.has(code)) {
        map.set(code, {
          code,
          name: labelFromConstants(code),
          type: '',
          subType: null,
          category: null,
          normalBalance: null,
          id: null,
          openingBalance: null,
          openingAsOf: null,
          openingBalanceNote: null,
        });
      }
    });
    return Array.from(map.values()).sort(compareChartRows);
  }, [accountsQuery.data, codesFromActivity]);

  const filteredAccountsList = useMemo(() => {
    const q = coaSearch.trim().toLowerCase();
    return accountsList.filter((a) => {
      if (coaTypeFilter) {
        const t = String(a.type || '').toUpperCase();
        if (t !== coaTypeFilter) return false;
      }
      if (!q) return true;
      const code = a.code != null ? String(a.code).toLowerCase() : '';
      const name = String(a.name || '').toLowerCase();
      const typ = String(a.type || '').toLowerCase();
      const cat = accountCategoryDisplay(a).toLowerCase();
      return code.includes(q) || name.includes(q) || typ.includes(q) || cat.includes(q);
    });
  }, [accountsList, coaSearch, coaTypeFilter]);

  const selectedGlCode =
    ledgerModalAccount?.code != null && String(ledgerModalAccount.code).trim() !== ''
      ? String(ledgerModalAccount.code).trim()
      : null;

  const activityForSelected = useMemo(() => {
    if (!selectedGlCode) return [];
    const txRows = txForCoaLedger
      .filter((t) => transactionTouchesAccount(t, selectedGlCode))
      .map((t) => ({
        kind: 'transaction',
        date: t.date ?? t.createdAt,
        sortId: String(t._id ?? t.id ?? ''),
        t,
      }));
    const jRows = journalLines
      .filter((j) => journalLineTouchesAccount(j, selectedGlCode))
      .map((j, i) => ({
        kind: 'journal',
        date: j.date ?? j.entryDate ?? j.postedAt ?? j.createdAt,
        sortId: `${j.journalEntryId ?? ''}-${j._id ?? j.id ?? `jl-${i}`}`,
        j,
      }));
    const merged = [...txRows, ...jRows];
    merged.sort((a, b) => {
      const da = String(a.date ?? '').slice(0, 10);
      const db = String(b.date ?? '').slice(0, 10);
      if (da !== db) return da.localeCompare(db);
      return String(a.sortId).localeCompare(String(b.sortId));
    });
    return merged;
  }, [txForCoaLedger, journalLines, selectedGlCode]);

  const periodNetForSelected = useMemo(() => {
    if (!selectedGlCode) return 0;
    let s = 0;
    for (const t of txForCoaLedger) {
      if (transactionTouchesAccount(t, selectedGlCode)) s += accountLineNet(t, selectedGlCode);
    }
    for (const j of journalLines) {
      s += journalLineNetForAccount(j, selectedGlCode);
    }
    return s;
  }, [txForCoaLedger, journalLines, selectedGlCode]);

  const createMutation = useMutation({
    mutationFn: (body) => createAccount(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting', 'accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      setModalOpen(false);
      setForm(defaultAccountForm());
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting', 'journal-entries'] });
    },
    onError: (err) => {
      setSaveError(formatTransactionMutationMessage(err).join('\n'));
    },
  });

  const openAdd = useCallback(() => {
    setSaveError(null);
    setForm(defaultAccountForm());
    setModalOpen(true);
  }, []);

  const openOpeningModal = useCallback((accountRow) => {
    if (!accountRow?.id) return;
    setOpeningSaveError(null);
    setOpeningForm({
      amount:
        accountRow.openingBalance != null && Number.isFinite(Number(accountRow.openingBalance))
          ? String(accountRow.openingBalance)
          : '',
      asOf: accountRow.openingAsOf || new Date().toISOString().slice(0, 10),
      note: accountRow.openingBalanceNote || '',
    });
    setOpeningModal(accountRow);
  }, []);

  const closeOpeningModal = useCallback(() => {
    setOpeningModal(null);
    setOpeningSaveError(null);
  }, []);

  const openingMutation = useMutation({
    mutationFn: ({ id, body }) => updateAccount(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting', 'accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting', 'journal-entries'] });
      closeOpeningModal();
    },
    onError: (err) => {
      setOpeningSaveError(formatTransactionMutationMessage(err).join('\n'));
    },
  });

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!ledgerModalAccount) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLedgerModalAccount(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ledgerModalAccount]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaveError(null);
    const name = String(form.name || '').trim();
    const type = String(form.type || '').trim();
    const subType = String(form.subType || '').trim();
    const normalBalance = String(form.normalBalance || '').trim();
    const useAuto = Boolean(form.autoCode);
    const code = String(form.code || '').trim();

    if (!name) {
      setSaveError('Account name is required.');
      return;
    }
    const typeNorm = type.toUpperCase();
    const allowedTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
    if (!typeNorm || !allowedTypes.includes(typeNorm)) {
      setSaveError('Account type must be ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE.');
      return;
    }
    if (!normalBalance || !['DEBIT', 'CREDIT'].includes(normalBalance)) {
      setSaveError('Select a normal balance (DEBIT or CREDIT).');
      return;
    }
    if (!useAuto && !code) {
      setSaveError('Enter an account code, or enable “Auto-assign code”.');
      return;
    }

    const body = {
      name,
      type: typeNorm,
      normalBalance,
      ...(subType ? { subType } : {}),
      ...(useAuto ? { autoCode: true } : { code }),
    };

    const obRaw = String(form.openingBalance ?? '').trim();
    if (obRaw !== '') {
      const ob = Number(obRaw);
      if (!Number.isFinite(ob)) {
        setSaveError('Opening balance must be a number.');
        return;
      }
      body.openingBalance = ob;
    }
    const asOf = String(form.openingAsOf || '').trim().slice(0, 10);
    if (asOf) body.openingBalanceAsOf = asOf;
    const obNote = String(form.openingBalanceNote || '').trim();
    if (obNote) body.openingBalanceNote = obNote;

    createMutation.mutate(body);
  };

  const handleOpeningSubmit = (e) => {
    e.preventDefault();
    setOpeningSaveError(null);
    const id = openingModal?.id;
    if (!id) return;
    const amtRaw = String(openingForm.amount ?? '').trim();
    const ob = amtRaw === '' ? 0 : Number(amtRaw);
    if (amtRaw !== '' && !Number.isFinite(ob)) {
      setOpeningSaveError('Opening balance must be a number.');
      return;
    }
    const asOf = String(openingForm.asOf || '').trim().slice(0, 10);
    const note = String(openingForm.note || '').trim();
    const body = {
      openingBalance: ob,
      ...(asOf ? { openingBalanceAsOf: asOf } : {}),
      openingBalanceNote: note,
    };
    openingMutation.mutate({ id, body });
  };

  const selectedMeta = ledgerModalAccount;
  const openingForSelected = selectedMeta?.openingBalance ?? null;
  const openingNum =
    openingForSelected != null && Number.isFinite(Number(openingForSelected))
      ? Number(openingForSelected)
      : 0;
  const closingNetForSelected = openingNum + periodNetForSelected;

  const accountsLoading = accountsQuery.isLoading;
  const txLoading = transactionsQuery.isLoading;
  const journalLoading = journalQuery.isLoading;
  const apiAccountsUnavailable = accountsQuery.isError;

  return (
    <div className="page-stack chart-of-accounts-page">
      <div className="page-header page-header--compact chart-of-accounts-header">
        <div className="page-header-left">
          <div className="page-title">Chart of Accounts</div>
          <div className="page-subtitle chart-of-accounts-lead">
            Set up GL codes, opening balances, and review account activity from your transaction feed.
            {apiAccountsUnavailable ? (
              <span className="chart-of-accounts-warn">
                {' '}
                Account list couldn&apos;t be loaded; showing defaults and codes seen on transactions.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {(accountsQuery.error || transactionsQuery.error || journalQuery.error) && (
        <div className="card card--error">
          <div className="card-body">
            {accountsQuery.error?.message ||
              transactionsQuery.error?.message ||
              journalQuery.error?.message ||
              'Request failed'}
          </div>
        </div>
      )}

      {openingModal && !readOnly && (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coa-opening-title"
          onClick={closeOpeningModal}
        >
          <div className="transactions-modal chart-of-accounts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="coa-opening-title">
                Opening balance —{' '}
                {openingModal.code != null && String(openingModal.code).trim() !== ''
                  ? `${openingModal.code}${openingModal.name ? ` (${openingModal.name})` : ''}`
                  : openingModal.name || `Account #${openingModal.id}`}
              </h3>
              <button type="button" className="transactions-modal-close" onClick={closeOpeningModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form onSubmit={handleOpeningSubmit}>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field">
                    <label htmlFor="coa-ob-amt">Opening balance (ZAR)</label>
                    <input
                      id="coa-ob-amt"
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={openingForm.amount}
                      onChange={(e) => setOpeningForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="coa-ob-date">As of date (informational)</label>
                    <input
                      id="coa-ob-date"
                      type="date"
                      className="form-control"
                      value={openingForm.asOf}
                      onChange={(e) => setOpeningForm((f) => ({ ...f, asOf: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="coa-ob-note">Opening balance note (optional)</label>
                    <input
                      id="coa-ob-note"
                      className="form-control"
                      value={openingForm.note}
                      onChange={(e) => setOpeningForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="e.g. Cutover from old system"
                    />
                  </div>
                </div>
                <p className="chart-of-accounts-api-note">
                  Updates via <code>PUT /api/accounting/accounts/:id</code> (opening fields, name, isActive, parentCode —
                  not <code>code</code>).
                </p>
                {openingSaveError && (
                  <div className="card card--error" style={{ marginTop: 12 }}>
                    <div className="card-body" style={{ whiteSpace: 'pre-line', fontSize: 13 }}>
                      {openingSaveError}
                    </div>
                  </div>
                )}
                <div className="transactions-modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={closeOpeningModal}
                    disabled={openingMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={openingMutation.isPending}>
                    {openingMutation.isPending ? 'Saving…' : 'Save opening balance'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {modalOpen && !readOnly && (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coa-modal-title"
          onClick={closeModal}
        >
          <div className="transactions-modal chart-of-accounts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3 id="coa-modal-title">Add account</h3>
              <button type="button" className="transactions-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form onSubmit={handleSubmit}>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="coa-name">Account name</label>
                    <input
                      id="coa-name"
                      className="form-control"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Bank — Main"
                      required
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="coa-type">Type</label>
                    <select
                      id="coa-type"
                      className="form-control"
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    >
                      {ACCOUNT_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="coa-subtype">Sub-type (optional)</label>
                    <input
                      id="coa-subtype"
                      className="form-control"
                      value={form.subType}
                      onChange={(e) => setForm((f) => ({ ...f, subType: e.target.value }))}
                      placeholder="e.g. current_asset"
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="coa-nb">Normal balance</label>
                    <select
                      id="coa-nb"
                      className="form-control"
                      value={form.normalBalance}
                      onChange={(e) => setForm((f) => ({ ...f, normalBalance: e.target.value }))}
                    >
                      {NORMAL_BALANCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide coa-auto-code-row">
                    <label className="coa-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.autoCode}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            autoCode: e.target.checked,
                            code: e.target.checked ? '' : f.code,
                          }))
                        }
                      />
                      Auto-assign code (<code>autoCode</code>)
                    </label>
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="coa-code">Account code</label>
                    <input
                      id="coa-code"
                      className="form-control"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      placeholder="e.g. 1002"
                      disabled={form.autoCode}
                      required={!form.autoCode}
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="coa-ob-new">Opening balance (optional)</label>
                    <input
                      id="coa-ob-new"
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={form.openingBalance}
                      onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                      placeholder="0 — on normal side; see help above"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="coa-ob-new-date">Opening as of (optional, ISO)</label>
                    <input
                      id="coa-ob-new-date"
                      type="date"
                      className="form-control"
                      value={form.openingAsOf}
                      onChange={(e) => setForm((f) => ({ ...f, openingAsOf: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="coa-ob-new-note">Opening note (optional)</label>
                    <input
                      id="coa-ob-new-note"
                      className="form-control"
                      value={form.openingBalanceNote}
                      onChange={(e) => setForm((f) => ({ ...f, openingBalanceNote: e.target.value }))}
                      placeholder="e.g. Cutover from old system"
                    />
                  </div>
                </div>
                <p className="chart-of-accounts-api-note">
                  <code>POST /api/accounting/accounts</code> with <code>name</code>, <code>type</code>,{' '}
                  <code>subType</code>?, <code>normalBalance</code>, <code>code</code> or <code>autoCode</code>, and
                  optional <code>openingBalance</code>, <code>openingBalanceAsOf</code>, <code>openingBalanceNote</code>.
                </p>
                {saveError && (
                  <div className="card card--error" style={{ marginTop: 12 }}>
                    <div className="card-body" style={{ whiteSpace: 'pre-line', fontSize: 13 }}>
                      {saveError}
                    </div>
                  </div>
                )}
                <div className="transactions-modal-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={closeModal} disabled={createMutation.isPending}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Saving…' : 'Create account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="card chart-of-accounts-card coa-report-card">
        <div className="coa-report-toolbar">
          <h2 className="coa-report-title">Account Report</h2>
          <div className="coa-report-toolbar-actions">
            {!readOnly && (
              <Link
                to={`${financeBase}/transactions`}
                className="btn btn-sm coa-btn-add-entry"
              >
                <i className="fas fa-book" aria-hidden />
                Add entry
              </Link>
            )}
            {!readOnly && (
              <button type="button" className="btn btn-sm btn-primary coa-btn-add-account" onClick={openAdd}>
                <i className="fas fa-plus" aria-hidden />
                Add account
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-outline coa-btn-refresh"
              onClick={() => {
                void accountsQuery.refetch();
                void transactionsQuery.refetch();
                void journalQuery.refetch();
              }}
              disabled={
                accountsQuery.isFetching || transactionsQuery.isFetching || journalQuery.isFetching
              }
            >
              <i
                className={`fas fa-sync-alt${
                  accountsQuery.isFetching || transactionsQuery.isFetching || journalQuery.isFetching
                    ? ' fa-spin'
                    : ''
                }`}
                aria-hidden
              />
              Refresh
            </button>
          </div>
        </div>
        <div className="coa-report-filters card-body">
          <div className="coa-report-search-field">
            <label htmlFor="coa-search">Search accounts</label>
            <input
              id="coa-search"
              type="search"
              className="form-control"
              placeholder="Search by account code, name, or type…"
              value={coaSearch}
              onChange={(e) => setCoaSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="coa-report-type-field">
            <label htmlFor="coa-type-filter">Filter by type</label>
            <select
              id="coa-type-filter"
              className="form-control"
              value={coaTypeFilter}
              onChange={(e) => setCoaTypeFilter(e.target.value)}
            >
              {COA_TYPE_FILTER_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="coa-report-count" aria-live="polite">
            {filteredAccountsList.length === accountsList.length
              ? `${accountsList.length} ${accountsList.length === 1 ? 'account' : 'accounts'}`
              : `Showing ${filteredAccountsList.length} of ${accountsList.length} accounts`}
          </p>
        </div>
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap chart-of-accounts-table-wrap coa-report-table-wrap">
            <table className="statement-table chart-of-accounts-table coa-report-table">
              <thead>
                <tr>
                  <th className="chart-of-accounts-th-code">Account code</th>
                  <th>Account name</th>
                  <th className="chart-of-accounts-th-tag">Type</th>
                  <th>Category</th>
                  <th className="coa-report-th-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {accountsLoading && !accountsList.length ? (
                  <tr>
                    <td colSpan={5}>Loading accounts…</td>
                  </tr>
                ) : null}
                {!accountsLoading && accountsList.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No accounts to show.</td>
                  </tr>
                ) : null}
                {!accountsLoading && accountsList.length > 0 && filteredAccountsList.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No accounts match your search or filter.</td>
                  </tr>
                ) : null}
                {filteredAccountsList.map((a) => {
                  const rowKey = accountListRowKey(a);
                  const ledgerOpen = sameAccountRow(ledgerModalAccount, a);
                  const codeKey = a.code != null && String(a.code).trim() !== '' ? String(a.code).trim() : null;
                  return (
                    <tr
                      key={rowKey}
                      className={ledgerOpen ? 'chart-of-accounts-row--selected' : undefined}
                    >
                      <td className="chart-of-accounts-code">
                        {codeKey ? <span className="chart-of-accounts-code-inner">{codeKey}</span> : '—'}
                      </td>
                      <td className="chart-of-accounts-name">{a.name || '—'}</td>
                      <td className="chart-of-accounts-cell-tag">
                        {a.type ? (
                          <span className="coa-table-type-pill">{accountTypeShortLabel(a.type)}</span>
                        ) : (
                          <span className="coa-table-type-pill coa-table-type-pill--empty">—</span>
                        )}
                      </td>
                      <td className="coa-report-category">{accountCategoryDisplay(a)}</td>
                      <td className="coa-report-actions-col">
                        <div className="coa-report-icon-actions">
                          <button
                            type="button"
                            className="coa-icon-action"
                            title="Edit opening balance"
                            disabled={readOnly || !a.id}
                            onClick={() => a.id && openOpeningModal(a)}
                          >
                            <i className="fas fa-edit" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={'coa-icon-action' + (ledgerOpen ? ' coa-icon-action--active' : '')}
                            title={ledgerOpen ? 'Close ledger' : 'View account ledger'}
                            onClick={() =>
                              ledgerOpen ? setLedgerModalAccount(null) : setLedgerModalAccount(a)
                            }
                          >
                            <i className="fas fa-eye" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(txList.length >= TX_LIMIT || journalLines.length >= JOURNAL_LIMIT) && (
            <p className="chart-of-accounts-limit-note">
              Ledger preview uses up to {JOURNAL_LIMIT} journal lines and {TX_LIMIT} finance transactions.{' '}
              {readOnly ? (
                <>
                  See <Link to="/ceo/ledger">Ledger</Link> for more.
                </>
              ) : (
                <>
                  Open <Link to="/finance/ledger">Ledger</Link> or{' '}
                  <Link to="/finance/transactions">Transactions</Link> for more.
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {selectedMeta ? (
        <div
          className="transactions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coa-ledger-title"
          onClick={() => setLedgerModalAccount(null)}
        >
          <div
            className="transactions-modal coa-ledger-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="transactions-modal-header">
              <h3 id="coa-ledger-title">
                Account ledger —{' '}
                {selectedGlCode ? (
                  <>
                    <span className="chart-of-accounts-activity-code">{selectedGlCode}</span>
                    <span className="chart-of-accounts-activity-sep" aria-hidden>
                      {' '}
                      /{' '}
                    </span>
                    {selectedMeta.name}
                  </>
                ) : (
                  <>
                    {selectedMeta.name}
                    <span className="chart-of-accounts-activity-badge">No code yet</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                className="transactions-modal-close"
                onClick={() => setLedgerModalAccount(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="transactions-modal-body coa-ledger-modal-body">
              <p className="chart-of-accounts-activity-hint coa-ledger-modal-hint">
                Opening balance from accounting plus movement from <strong>posted journal lines</strong> (
                {JOURNAL_LIMIT} max) and <strong>finance transactions</strong> ({TX_LIMIT} max). When a transaction
                is already posted to the ledger, it is counted via journals only so it is not double-counted.
              </p>
              <div className="chart-of-accounts-stats coa-ledger-stats" role="group" aria-label="Account balances">
                <div className="chart-of-accounts-stat">
                  <span className="chart-of-accounts-stat-label">Opening</span>
                  <span className="chart-of-accounts-stat-value">
                    {openingForSelected != null ? moneyOrBlank(openingNum) : '—'}
                  </span>
                </div>
                <div className="chart-of-accounts-stat">
                  <span className="chart-of-accounts-stat-label">Movement</span>
                  <span
                    className={
                      'chart-of-accounts-stat-value ' +
                      (periodNetForSelected >= 0 ? 'chart-of-accounts-stat--pos' : 'chart-of-accounts-stat--neg')
                    }
                  >
                    {moneyOrBlank(periodNetForSelected)}
                  </span>
                </div>
                <div className="chart-of-accounts-stat">
                  <span className="chart-of-accounts-stat-label">Balance</span>
                  <span
                    className={
                      'chart-of-accounts-stat-value ' +
                      (closingNetForSelected >= 0 ? 'chart-of-accounts-stat--pos' : 'chart-of-accounts-stat--neg')
                    }
                  >
                    {moneyOrBlank(closingNetForSelected)}
                  </span>
                </div>
                <div className="chart-of-accounts-stat chart-of-accounts-stat--lines">
                  <span className="chart-of-accounts-stat-label">Lines</span>
                  <span className="chart-of-accounts-stat-value">{activityForSelected.length}</span>
                </div>
              </div>
              <div className="statement-table-wrap chart-of-accounts-table-wrap coa-ledger-table-wrap">
                <table className="statement-table chart-of-accounts-activity-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Other account</th>
                      <th className="statement-table-num">Debit</th>
                      <th className="statement-table-num">Credit</th>
                      <th className="statement-table-num">This account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGlCode && (txLoading || journalLoading) && activityForSelected.length === 0 ? (
                      <tr>
                        <td colSpan={8}>Loading journal entries and transactions…</td>
                      </tr>
                    ) : null}
                    {!txLoading && !journalLoading && !selectedGlCode ? (
                      <tr>
                        <td colSpan={8}>
                          This account has no GL code yet, so journal lines and transactions cannot be matched here.
                          After the server assigns a code (or you add one), open the ledger again.
                        </td>
                      </tr>
                    ) : null}
                    {!txLoading &&
                    !journalLoading &&
                    selectedGlCode &&
                    activityForSelected.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          No journal lines or transactions in the loaded window touch this account.
                        </td>
                      </tr>
                    ) : null}
                    {selectedGlCode &&
                      activityForSelected.map((row) => {
                        if (row.kind === 'journal') {
                          const j = row.j;
                          const { debit, credit } = getJournalLineDebitCredit(j);
                          const lineNet = journalLineNetForAccount(j, selectedGlCode);
                          return (
                            <tr key={`j-${row.sortId}`}>
                              <td>{formatTableDate(j.date ?? j.postedAt ?? j.createdAt)}</td>
                              <td>
                                <span className="badge badge-confirmed">Journal</span>
                              </td>
                              <td>Journal</td>
                              <td>
                                {j.description ?? j.memo ?? j.narration ?? j._entryDescription ?? '—'}
                              </td>
                              <td className="chart-of-accounts-cp">
                                {counterpartyJournalLine(j, selectedGlCode)}
                              </td>
                              <td className="statement-table-num pl-neg">
                                {debit > 0 ? moneyOrBlank(debit) : '—'}
                              </td>
                              <td className="statement-table-num pl-pos">
                                {credit > 0 ? moneyOrBlank(credit) : '—'}
                              </td>
                              <td
                                className={
                                  'statement-table-num ' +
                                  ((Number(lineNet) || 0) >= 0 ? 'pl-pos' : 'pl-neg')
                                }
                              >
                                {moneyOrBlank(lineNet)}
                              </td>
                            </tr>
                          );
                        }
                        const t = row.t;
                        const id = t._id ?? t.id;
                        const refundLike = t.category === 'refund';
                        const { rowDebit, rowCredit } = getTransactionRowDebitCreditNet(t);
                        const { debitCode, creditCode } = getTransactionDebitCreditAccounts(t);
                        const lineNet = accountLineNet(t, selectedGlCode);
                        const showDebit = debitCode === selectedGlCode ? rowDebit : '';
                        const showCredit = creditCode === selectedGlCode ? rowCredit : '';
                        return (
                          <tr key={id || JSON.stringify(t)}>
                            <td>{formatTableDate(t.date)}</td>
                            <td>
                              <span
                                className={
                                  'badge ' +
                                  (refundLike
                                    ? 'badge-pending'
                                    : t.type === 'income'
                                      ? 'badge-confirmed'
                                      : 'badge-cancelled')
                                }
                              >
                                {refundLike ? 'refund' : t.type || '—'}
                              </span>
                            </td>
                            <td>{transactionCategoryLabel(t.category)}</td>
                            <td>{t.description || '—'}</td>
                            <td className="chart-of-accounts-cp">{counterpartyLine(t, selectedGlCode)}</td>
                            <td className="statement-table-num pl-neg">
                              {showDebit !== '' ? moneyOrBlank(showDebit) : '—'}
                            </td>
                            <td className="statement-table-num pl-pos">
                              {showCredit !== '' ? moneyOrBlank(showCredit) : '—'}
                            </td>
                            <td
                              className={
                                'statement-table-num ' +
                                ((Number(lineNet) || 0) >= 0 ? 'pl-pos' : 'pl-neg')
                              }
                            >
                              {moneyOrBlank(lineNet)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
