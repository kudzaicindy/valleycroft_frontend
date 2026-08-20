import { useQuery } from '@tanstack/react-query';
import { getFoodAddOns } from '@/api/foodAddOns';
import { normalizeFoodAddOnCatalog } from '@/content/foodAddons';

const PUBLIC_QUERY_KEY = ['food-add-ons', 'public'];

export function useFoodAddOns({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: PUBLIC_QUERY_KEY,
    queryFn: async () => {
      const raw = await getFoodAddOns();
      return normalizeFoodAddOnCatalog(raw, { activeOnly: true });
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    options: query.data ?? [],
  };
}

export { PUBLIC_QUERY_KEY as FOOD_ADDONS_QUERY_KEY };
