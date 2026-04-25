import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { createStockItem, deleteStockItem, getEquipment, getStock, updateStockItem } from '@/api/inventory';
import { INVENTORY_DEMO_STOCK } from '@/utils/inventoryDemoData';
import { normalizeInventoryPayload } from '@/utils/inventoryData';
import './InventoryPage.css';

function inferInventoryEmoji(name, kind = 'consumable') {
  const value = String(name || '').toLowerCase();
  const iconRules = [
    { emoji: '☕', terms: ['coffee', 'tea', 'pod'] },
    { emoji: '🧼', terms: ['soap', 'detergent', 'clean', 'bleach', 'sanitizer'] },
    { emoji: '🧻', terms: ['tissue', 'toilet', 'paper', 'napkin'] },
    { emoji: '🍽️', terms: ['plate', 'cup', 'glass', 'fork', 'spoon', 'knife'] },
    { emoji: '🛏️', terms: ['linen', 'sheet', 'blanket', 'pillow', 'duvet', 'towel'] },
    { emoji: '💡', terms: ['light', 'bulb', 'lamp'] },
    { emoji: '🔋', terms: ['battery', 'cell'] },
    { emoji: '🧯', terms: ['fire', 'extinguisher'] },
    { emoji: '🛠️', terms: ['tool', 'drill', 'hammer', 'wrench', 'spanner'] },
    { emoji: '📦', terms: ['box', 'carton', 'pack', 'stock'] },
    { emoji: '🥤', terms: ['drink', 'water', 'juice', 'soda', 'beverage'] },
    { emoji: '🍴', terms: ['food', 'catering', 'meal'] },
  ];
  const match = iconRules.find((rule) => rule.terms.some((term) => value.includes(term)));
  if (match) return match.emoji;
  return kind === 'equipment' ? '🔧' : '📦';
}

function parseQtyLabel(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '—') return { quantity: 0, unit: '' };
  const matched = raw.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!matched) return { quantity: 0, unit: raw };
  const quantity = Math.max(0, Number(matched[1]) || 0);
  const unit = (matched[2] || '').trim();
  return { quantity, unit };
}

export default function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = String(user?.role || '').toLowerCase();
  const canMutateInventory = role === 'admin';
  const inventoryQuery = useQuery({
    queryKey: ['inventory', 'stock-and-equipment'],
    retry: false,
    queryFn: async () => {
      const [stockResult, equipmentResult] = await Promise.allSettled([getStock(), getEquipment()]);
      const stockRes = stockResult.status === 'fulfilled' ? stockResult.value : null;
      const equipmentRes = equipmentResult.status === 'fulfilled' ? equipmentResult.value : null;
      return normalizeInventoryPayload(stockRes?.data ?? stockRes, equipmentRes?.data ?? equipmentRes);
    },
  });
  const sourceItems = useMemo(() => {
    const apiItems = Array.isArray(inventoryQuery.data) ? inventoryQuery.data : [];
    return apiItems.length ? apiItems : INVENTORY_DEMO_STOCK.map((x) => ({ ...x }));
  }, [inventoryQuery.data]);
  const [items, setItems] = useState(() => sourceItems);
  useEffect(() => {
    setItems(sourceItems.map((x) => ({ ...x })));
  }, [sourceItems]);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [bandFilter, setBandFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState('consumable');
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addReorderLevel, setAddReorderLevel] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [editReorderLevel, setEditReorderLevel] = useState('');
  const [saveError, setSaveError] = useState('');

  const rows = useMemo(() => {
    let r = items;
    if (kindFilter) r = r.filter((x) => (x.kind || 'consumable') === kindFilter);
    if (bandFilter) r = r.filter((x) => x.band === bandFilter);
    if (monthFilter) {
      r = r.filter((x) => !x.asOfMonth || x.asOfMonth === monthFilter);
    }
    if (!search.trim()) return r;
    const q = search.trim().toLowerCase();
    return r.filter((x) => x.name.toLowerCase().includes(q));
  }, [items, search, bandFilter, kindFilter, monthFilter]);

  const closeModal = useCallback(() => {
    setAddOpen(false);
    setAddKind('consumable');
    setAddName('');
    setAddQty('');
    setAddReorderLevel('');
    setSaveError('');
  }, []);

  const createMutation = useMutation({
    mutationFn: (body) => createStockItem(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      closeModal();
    },
    onError: (err) => {
      setSaveError(err?.response?.data?.message || err?.message || 'Could not add stock item.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateStockItem(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      closeEditModal();
    },
    onError: (err) => {
      setSaveError(err?.response?.data?.message || err?.message || 'Could not update stock item.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteStockItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setSaveError('');
    },
    onError: (err) => {
      setSaveError(err?.response?.data?.message || err?.message || 'Could not delete stock item.');
    },
  });

  async function handleAddSubmit(e) {
    e.preventDefault();
    if (!canMutateInventory) return;
    const name = addName.trim();
    if (!name) return;
    setSaveError('');
    const { quantity, unit } = parseQtyLabel(addQty);
    const reorderLevel = Math.max(0, Number(addReorderLevel) || 0);
    const body = {
      name,
      category: addKind === 'equipment' ? 'equipment' : 'consumable',
      quantity,
      reorderLevel,
      ...(unit ? { unit } : {}),
      emoji: inferInventoryEmoji(name, addKind),
    };
    await createMutation.mutateAsync(body);
  }

  function openEditStock(row) {
    setEditId(row.id);
    setEditQty(row.qty ?? '');
    setEditReorderLevel(String(row.reorderLevel ?? ''));
    setEditOpen(true);
  }

  function closeEditModal() {
    setEditOpen(false);
    setEditId(null);
    setEditQty('');
    setEditReorderLevel('');
    setSaveError('');
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (editId == null || !canMutateInventory) return;
    setSaveError('');
    const { quantity, unit } = parseQtyLabel(editQty);
    const reorderLevel = Math.max(0, Number(editReorderLevel) || 0);
    const body = {
      quantity,
      reorderLevel,
      ...(unit ? { unit } : {}),
    };
    await updateMutation.mutateAsync({ id: editId, body });
  }

  const editingRow = editId != null ? items.find((it) => it.id === editId) : null;
  const addPreviewEmoji = useMemo(() => inferInventoryEmoji(addName, addKind), [addName, addKind]);

  const handleDeleteStock = useCallback(
    async (row) => {
      if (!canMutateInventory) return;
      const id = String(row?.id || '').trim();
      if (!id) return;
      const approved = window.confirm(`Delete "${row?.name || 'this inventory item'}"?`);
      if (!approved) return;
      setSaveError('');
      await deleteMutation.mutateAsync(id);
    },
    [canMutateInventory, deleteMutation]
  );

  const filteredCount = rows.length;
  const totalCount = items.length;
  const showFilterHint =
    filteredCount !== totalCount || search.trim() || bandFilter || kindFilter || monthFilter;

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div className="inventory-header-text">
          <h1 className="page-title">Inventory &amp; equipment</h1>
          <p className="page-subtitle">
            Consumables and equipment in one register.
            {inventoryQuery.isPending ? ' Loading from inventory API…' : ''}
            {inventoryQuery.isError ? ' Inventory API unavailable, showing fallback data.' : ''}
          </p>
        </div>
        <div className="inventory-header-actions">
          {canMutateInventory ? (
            <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
              <i className="fas fa-plus" aria-hidden /> Add item
            </button>
          ) : null}
        </div>
      </header>
      {!canMutateInventory && (
        <p className="inventory-toolbar-meta">
          Read-only mode: only admins can add, update, or delete inventory items.
        </p>
      )}
      {saveError ? (
        <div className="card card--error">
          <div className="card-body">{saveError}</div>
        </div>
      ) : null}

      <div className="inventory-toolbar">
        <DashboardListFilters
          embedded
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by item name…"
          month={monthFilter}
          onMonthChange={setMonthFilter}
        />
        <select
          className="inventory-filter"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="consumable">Consumables</option>
          <option value="equipment">Equipment</option>
        </select>
        <select
          className="inventory-filter"
          value={bandFilter}
          onChange={(e) => setBandFilter(e.target.value)}
          aria-label="Filter by stock level"
        >
          <option value="">All levels</option>
          <option value="low">Low stock only</option>
          <option value="ok">Adequate only</option>
        </select>
      </div>
      {showFilterHint && (
        <p className="inventory-toolbar-meta">
          Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> items
          {search.trim() ? ` matching “${search.trim()}”` : ''}
          {kindFilter === 'consumable' ? ' · consumables' : ''}
          {kindFilter === 'equipment' ? ' · equipment' : ''}
          {bandFilter === 'low' ? ' · low stock filter' : ''}
          {bandFilter === 'ok' ? ' · adequate filter' : ''}
          {monthFilter ? ' · month filter' : ''}
        </p>
      )}

      <section className="inventory-section" aria-labelledby="inv-consumables-heading">
        <div className="inventory-section-head">
          <div>
            <h2 id="inv-consumables-heading" className="inventory-section-title">
              Stock &amp; equipment register
            </h2>
            <p className="inventory-section-desc">Quantity, reorder thresholds, and quick updates</p>
          </div>
        </div>

        <div className="inventory-table-panel">
          {rows.length === 0 && (
            <div className="inventory-empty inventory-empty--in-panel">
              <div className="inventory-empty-icon" aria-hidden>
                <i className="fas fa-box-open" />
              </div>
              <div className="inventory-empty-title">No items match</div>
              <p>Try another search or filter, or add a new line item.</p>
            </div>
          )}
          {rows.length > 0 && (
            <div className="inventory-table-wrap">
              <table className="inventory-data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Level</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={row.band === 'low' ? 'inventory-row--low' : ''}>
                      <td>
                        <span className="inventory-cell-item">
                          <span className="inventory-cell-emoji" aria-hidden>
                            {row.emoji}
                          </span>
                          <span className="inventory-cell-name">{row.name}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`inventory-type-tag ${(row.kind || 'consumable') === 'equipment' ? 'inventory-type-tag--eq' : ''}`}>
                          {(row.kind || 'consumable') === 'equipment' ? 'Equipment' : 'Consumable'}
                        </span>
                      </td>
                      <td className="inventory-cell-muted">{row.qty}</td>
                      <td>
                        <div className="inventory-cell-level">
                          <div className="inventory-inline-bar" role="progressbar" aria-valuenow={row.level} aria-valuemin={0} aria-valuemax={100}>
                            <div
                              className={`inventory-inline-bar-fill ${row.band === 'low' ? 'inventory-inline-bar-fill--low' : 'inventory-inline-bar-fill--ok'}`}
                              style={{ width: `${row.level}%` }}
                            />
                          </div>
                          <span className="inventory-inline-pct">{row.level}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`inventory-status-pill ${row.band === 'low' ? 'inventory-status-pill--low' : 'inventory-status-pill--ok'}`}>
                          {row.band === 'low' ? 'Low stock' : 'In range'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canMutateInventory ? (
                          <>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => openEditStock(row)}>
                              <i className="fas fa-sliders-h" aria-hidden /> Update
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ marginLeft: 8 }}
                              onClick={() => handleDeleteStock(row)}
                              disabled={deleteMutation.isPending}
                            >
                              <i className="fas fa-trash-alt" aria-hidden /> Delete
                            </button>
                          </>
                        ) : (
                          <span className="inventory-cell-muted">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {addOpen && canMutateInventory && (
        <div className="rooms-events-modal-overlay" onClick={closeModal} role="presentation">
          <div
            className="rooms-events-modal bookings-add-internal-modal inventory-modal"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inv-add-title"
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="inv-add-title" className="rooms-events-modal-title">
                  Add item
                </h2>
                <p className="rooms-events-modal-sub">Creates stock via API and refreshes the inventory register</p>
              </div>
              <button type="button" className="rooms-events-modal-close" onClick={closeModal} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              <form className="form-stack" onSubmit={handleAddSubmit}>
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <select
                    className="form-control"
                    value={addKind}
                    onChange={(e) => {
                      setAddKind(e.target.value);
                    }}
                  >
                    <option value="consumable">Consumable / supplies</option>
                    <option value="equipment">Equipment / assets</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Item name *</label>
                  <input className="form-control" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Dish soap" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity / unit label</label>
                  <input className="form-control" value={addQty} onChange={(e) => setAddQty(e.target.value)} placeholder="e.g. 12 bottles" />
                </div>
                <div className="form-group">
                  <label className="form-label">Reorder level *</label>
                  <input
                    type="number"
                    min={0}
                    className="form-control"
                    value={addReorderLevel}
                    onChange={(e) => setAddReorderLevel(e.target.value)}
                    required
                    style={{ maxWidth: 160 }}
                  />
                  <small className="text-muted">Low stock is calculated when quantity is at or below this threshold.</small>
                </div>
                <div className="form-group">
                  <label className="form-label">Icon</label>
                  <div className="form-control" style={{ maxWidth: 160 }}>
                    {addPreviewEmoji} Auto-selected
                  </div>
                  <small className="text-muted">Icon is selected automatically from the item name.</small>
                </div>
                <div className="bookings-add-internal-actions">
                  <button type="button" className="btn btn-outline" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Saving…' : 'Add item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editOpen && editingRow && canMutateInventory && (
        <div className="rooms-events-modal-overlay" onClick={closeEditModal} role="presentation">
          <div
            className="rooms-events-modal bookings-add-internal-modal inventory-modal"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inv-edit-title"
          >
            <div className="rooms-events-modal-header">
              <div>
                <h2 id="inv-edit-title" className="rooms-events-modal-title">
                  Update stock
                </h2>
                <p className="rooms-events-modal-sub">
                  {editingRow.emoji} {editingRow.name}
                </p>
              </div>
              <button type="button" className="rooms-events-modal-close" onClick={closeEditModal} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="rooms-events-modal-body">
              <form className="form-stack" onSubmit={handleEditSubmit}>
                <div className="form-group">
                  <label className="form-label">Quantity / unit label</label>
                  <input
                    className="form-control"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    placeholder="e.g. 12 bottles"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reorder level *</label>
                  <input
                    type="number"
                    min={0}
                    className="form-control"
                    value={editReorderLevel}
                    onChange={(e) => setEditReorderLevel(e.target.value)}
                    required
                    style={{ maxWidth: 160 }}
                  />
                  <small className="text-muted">Low stock is calculated when quantity is at or below this threshold.</small>
                </div>
                <div className="bookings-add-internal-actions">
                  <button type="button" className="btn btn-outline" onClick={closeEditModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
