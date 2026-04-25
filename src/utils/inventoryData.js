function toMonthKey(value) {
  if (!value) return '';
  const s = String(value).trim();
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return `${ym[1]}-${ym[2]}`;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function pick(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return null;
}

function normalizeRow(raw, kind, fallbackEmoji) {
  const quantityRaw = Number(pick(raw, ['quantity', 'qty', 'stock']));
  const reorderRaw = Number(pick(raw, ['reorderLevel', 'minimumStock', 'threshold']));
  const explicitLevelRaw = Number(pick(raw, ['level', 'percentage', 'stockLevel', 'currentLevel']));
  const explicitLowFlag = Boolean(pick(raw, ['lowStock', 'isLowStock']));
  const hasQty = Number.isFinite(quantityRaw);
  const hasReorder = Number.isFinite(reorderRaw) && reorderRaw >= 0;
  const lowByThreshold = hasQty && hasReorder ? quantityRaw <= reorderRaw : false;
  const ratioLevel = hasQty && hasReorder
    ? (reorderRaw > 0
      ? Math.max(0, Math.min(100, (quantityRaw / reorderRaw) * 100))
      : (quantityRaw > 0 ? 100 : 0))
    : null;
  // Stock level should come from reorder level when reorder data is present.
  const level = Number.isFinite(ratioLevel)
    ? ratioLevel
    : Number.isFinite(explicitLevelRaw)
      ? Math.max(0, Math.min(100, explicitLevelRaw))
      : (explicitLowFlag || lowByThreshold ? 15 : 65);
  const band = explicitLowFlag || lowByThreshold || level < 30 ? 'low' : 'ok';
  const quantityLabel = hasQty
    ? `${quantityRaw}${raw?.unit ? ` ${raw.unit}` : ''}`
    : String(pick(raw, ['qty', 'quantityLabel']) ?? '—');
  return {
    id: pick(raw, ['_id', 'id']) ?? `${kind}-${Math.random().toString(36).slice(2)}`,
    kind,
    category: String(pick(raw, ['category']) ?? ''),
    name: String(pick(raw, ['name', 'itemName', 'title']) ?? 'Unnamed item'),
    quantity: hasQty ? quantityRaw : 0,
    reorderLevel: hasReorder ? reorderRaw : 0,
    unit: String(raw?.unit || '').trim(),
    qty: quantityLabel,
    level,
    band,
    emoji: String(pick(raw, ['emoji', 'icon']) ?? fallbackEmoji),
    // Inventory endpoints represent current stock levels; do not month-scope by created/updated timestamps.
    asOfMonth: toMonthKey(pick(raw, ['asOfMonth', 'monthKey', 'period'])),
  };
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export function normalizeInventoryPayload(stockPayload, equipmentPayload) {
  const stockRows = toArray(stockPayload).map((row) => normalizeRow(row, 'consumable', '📦'));
  const equipmentRows = toArray(equipmentPayload).map((row) => normalizeRow(row, 'equipment', '🔧'));
  return [...stockRows, ...equipmentRows];
}

export function inventorySnapshotFromRows(rows, monthKey) {
  const key = String(monthKey || '').trim();
  const scoped = (Array.isArray(rows) ? rows : []).filter((row) => !key || !row.asOfMonth || row.asOfMonth === key);
  return {
    monthKey: key,
    totalCount: scoped.length,
    lowCount: scoped.filter((row) => row.band === 'low').length,
  };
}
