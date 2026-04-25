import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAccounts } from '@/api/accounting';
import { ACCOUNT_OPTIONS } from '@/constants/financeAccounts';
import {
  normalizeAccountsFromResponse,
  accountsToDebitCreditSelectOptions,
} from '@/utils/accountsFromApi';

/**
 * Loads chart-of-accounts for dropdowns (same query key as Chart of Accounts page for cache sharing).
 * Falls back to {@link ACCOUNT_OPTIONS} when the API returns nothing or errors.
 */
export function useAccountsSelectOptions() {
  const q = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: async () => normalizeAccountsFromResponse(await getAccounts()),
    staleTime: 60_000,
  });

  const options = useMemo(() => {
    const rows = q.data;
    if (Array.isArray(rows) && rows.length > 0) {
      return accountsToDebitCreditSelectOptions(rows);
    }
    return ACCOUNT_OPTIONS;
  }, [q.data]);

  const labelByCode = useMemo(() => {
    const m = new Map();
    for (const o of options) {
      m.set(String(o.value).trim(), o.label);
    }
    return m;
  }, [options]);

  return {
    options,
    labelByCode,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error,
  };
}
