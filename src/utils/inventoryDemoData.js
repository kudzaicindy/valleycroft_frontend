export const INVENTORY_DEMO_STOCK = [
  { id: '1', kind: 'consumable', name: 'Toilet Paper Rolls', qty: '6 units', level: 12, band: 'low', emoji: '🧻', asOfMonth: '2026-04' },
  { id: '2', kind: 'consumable', name: 'Fresh Linen Sets', qty: '24 sets', level: 68, band: 'ok', emoji: '🛏️', asOfMonth: '2026-04' },
  { id: '3', kind: 'consumable', name: 'Cleaning Supplies', qty: 'Mixed', level: 45, band: 'ok', emoji: '🧴', asOfMonth: '2026-03' },
  { id: '4', kind: 'consumable', name: 'Coffee & Tea', qty: 'Pantry', level: 8, band: 'low', emoji: '☕', asOfMonth: '2026-03' },
  { id: '5', kind: 'equipment', name: 'Commercial mower', qty: '1 unit', level: 72, band: 'ok', emoji: '🛞', asOfMonth: '2026-04' },
];

function normalizeBand(item) {
  if (item?.band) return String(item.band).toLowerCase();
  const level = Number(item?.level);
  if (!Number.isFinite(level)) return 'ok';
  return level < 30 ? 'low' : 'ok';
}

export function getInventorySnapshotForMonth(monthKey) {
  const key = String(monthKey || '').trim();
  const monthRows = INVENTORY_DEMO_STOCK.filter((x) => !key || !x.asOfMonth || x.asOfMonth === key);
  const totalCount = monthRows.length;
  const lowCount = monthRows.filter((x) => normalizeBand(x) === 'low').length;
  return { monthKey: key, totalCount, lowCount };
}
