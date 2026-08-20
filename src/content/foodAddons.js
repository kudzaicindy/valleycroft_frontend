/**
 * Food add-on pricing helpers. Rates come from GET /api/food-add-ons; defaults match API seed.
 */

export const FOOD_ADDON_DEFAULTS = {
  breakfast: { unitPrice: 100, label: 'Breakfast' },
  picnic: { unitPrice: 800, label: 'Picnic setup + hamper' },
};

/** Fixed billing rules per add-on (not editable via API yet). */
const FOOD_ADDON_META = {
  breakfast: {
    chip: '🍽️ Breakfast',
    description: 'Farm breakfast spread each morning',
    perNight: true,
    defaultRateLabel: 'per person per morning',
  },
  picnic: {
    chip: '🧺 Picnic setup + hamper',
    description: 'Outdoor setup with blankets, décor and curated hamper',
    perNight: false,
    defaultRateLabel: 'per person (one-time)',
  },
};

function addOnId(row) {
  return String(row?.addOnId ?? row?.id ?? row?.slug ?? '').trim().toLowerCase();
}

function resolveUnitLabel(rateLabel, meta) {
  const raw = String(rateLabel || '').trim();
  if (!raw) return meta.defaultRateLabel;
  // API may return a full phrase like "R 800 per person (one-time)" — keep billing suffix only.
  if (/^R\s*[\d,]/i.test(raw)) {
    const suffix = raw.replace(/^R\s*[\d,]+(?:\.\d+)?\s*/i, '').trim();
    return suffix || meta.defaultRateLabel;
  }
  return raw;
}

const FALSEY_FLAGS = new Set([false, 0, '0', 'false', 'no', 'off', 'inactive', 'hidden']);

/** Admin "Visible on public site" (`isActive`) and related API aliases. */
export function isFoodAddOnPubliclyVisible(row) {
  if (!row || typeof row !== 'object') return true;
  const flags = [
    row.isActive,
    row.active,
    row.visible,
    row.isVisible,
    row.visibleOnPublicSite,
    row.visibleOnSite,
    row.listed,
  ];
  return !flags.some((v) => {
    if (v == null || v === '') return false;
    if (typeof v === 'string') return FALSEY_FLAGS.has(v.trim().toLowerCase());
    return FALSEY_FLAGS.has(v);
  });
}

/**
 * Map API catalogue row to UI option shape.
 * @param {Record<string, unknown>} row
 */
export function normalizeFoodAddOnRow(row) {
  const id = addOnId(row);
  const meta = FOOD_ADDON_META[id];
  const defaults = FOOD_ADDON_DEFAULTS[id];
  if (!id || !meta) return null;

  const unitPrice = Number(row.unitPrice ?? row.price ?? defaults?.unitPrice ?? 0);
  const label = String(row.label || defaults?.label || id).trim() || defaults?.label || id;
  const unitLabel = resolveUnitLabel(row.rateLabel, meta);
  const isActive = isFoodAddOnPubliclyVisible(row);

  return {
    id,
    label,
    chip: meta.chip.includes(label) ? meta.chip : `${meta.chip.split(' ')[0]} ${label}`,
    description: String(row.description || meta.description).trim() || meta.description,
    rate: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : defaults?.unitPrice ?? 0,
    perNight: meta.perNight,
    unitLabel,
    isActive,
  };
}

/**
 * @param {unknown} apiList
 * @param {{ activeOnly?: boolean }} [opts]
 */
export function normalizeFoodAddOnCatalog(apiList, opts = {}) {
  const { activeOnly = true } = opts;
  const rows = Array.isArray(apiList) ? apiList : [];
  const mapped = rows.map(normalizeFoodAddOnRow).filter(Boolean);
  const byId = new Map(mapped.map((o) => [o.id, o]));

  // Admin manage: fill any missing known add-ons so they can be re-enabled.
  // Public catalogue: trust the API list — omitted items stay hidden.
  if (!activeOnly) {
    for (const id of Object.keys(FOOD_ADDON_META)) {
      if (!byId.has(id)) {
        const fallback = normalizeFoodAddOnRow({ addOnId: id, ...FOOD_ADDON_DEFAULTS[id] });
        if (fallback) byId.set(id, fallback);
      }
    }
  }

  let list = [...byId.values()].sort((a, b) => {
    const order = ['breakfast', 'picnic'];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  if (activeOnly) list = list.filter((o) => o.isActive);
  return list;
}

/** Fallback when public API is unavailable (embed / offline). */
export const DEFAULT_FOOD_ADDON_OPTIONS = normalizeFoodAddOnCatalog(
  Object.entries(FOOD_ADDON_DEFAULTS).map(([addOnId, d]) => ({ addOnId, ...d })),
  { activeOnly: true }
);

export function formatFoodAddonRate(option) {
  return `R ${option.rate.toLocaleString('en-ZA')} ${option.unitLabel}`;
}

export function foodAddonLineTotal(option, guestCount, nights = 1) {
  const guests = Math.max(0, Number(guestCount) || 0);
  const n = Math.max(1, Number(nights) || 1);
  if (!guests || !option) return 0;
  if (option.perNight) return option.rate * guests * n;
  return option.rate * guests;
}

function resolveOptions(options) {
  if (Array.isArray(options)) return options;
  return DEFAULT_FOOD_ADDON_OPTIONS;
}

/**
 * @param {string[]} selectedIds
 * @param {number} guestCount
 * @param {number} [nights]
 * @param {Array<{ id: string, rate: number, perNight?: boolean, label?: string }>} [options]
 */
export function foodAddonsTotal(selectedIds, guestCount, nights = 1, options) {
  const ids = new Set(selectedIds);
  return resolveOptions(options).reduce((sum, opt) => {
    if (!ids.has(opt.id)) return sum;
    return sum + foodAddonLineTotal(opt, guestCount, nights);
  }, 0);
}

/**
 * @param {string[]} selectedIds
 * @param {number} guestCount
 * @param {number} [nights]
 * @param {Array<{ id: string, rate: number, perNight?: boolean, label?: string }>} [options]
 */
export function describeFoodAddonSelections(selectedIds, guestCount, nights = 1, options) {
  const ids = new Set(selectedIds);
  return resolveOptions(options)
    .filter((opt) => ids.has(opt.id))
    .map((opt) => {
      const line = foodAddonLineTotal(opt, guestCount, nights);
      return `${opt.label} (R ${line.toLocaleString('en-ZA')})`;
    });
}

export function findFoodAddOnOption(options, id) {
  return resolveOptions(options).find((o) => o.id === id) ?? null;
}

/** Short copy for landing/marketing, e.g. "R 100 per person per morning". */
export function foodAddOnRatePhrase(option) {
  if (!option || option.rate <= 0) return 'on request';
  return `R ${option.rate.toLocaleString('en-ZA')} ${option.unitLabel}`;
}

export function foodAddOnsPricingSummary(options) {
  const breakfast = findFoodAddOnOption(options, 'breakfast');
  const picnic = findFoodAddOnOption(options, 'picnic');
  const parts = [];
  if (breakfast?.rate > 0) {
    parts.push(`${breakfast.label} ${foodAddOnRatePhrase(breakfast)}`);
  }
  if (picnic?.rate > 0) {
    parts.push(`picnic setup with hamper ${foodAddOnRatePhrase(picnic)}`);
  }
  return parts.join('; ');
}
