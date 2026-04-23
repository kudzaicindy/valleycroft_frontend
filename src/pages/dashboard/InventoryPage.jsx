import { useMemo, useState, useCallback } from 'react';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import './InventoryPage.css';

/** Optional `asOfMonth` (YYYY-MM) for month filter demo rows. */
const DEMO_STOCK = [
  { id: '1', kind: 'consumable', name: 'Toilet Paper Rolls', qty: '6 units', level: 12, band: 'low', emoji: '🧻', asOfMonth: '2026-04' },
  { id: '2', kind: 'consumable', name: 'Fresh Linen Sets', qty: '24 sets', level: 68, band: 'ok', emoji: '🛏️', asOfMonth: '2026-04' },
  { id: '3', kind: 'consumable', name: 'Cleaning Supplies', qty: 'Mixed', level: 45, band: 'ok', emoji: '🧴', asOfMonth: '2026-03' },
  { id: '4', kind: 'consumable', name: 'Coffee & Tea', qty: 'Pantry', level: 8, band: 'low', emoji: '☕', asOfMonth: '2026-03' },
  { id: '5', kind: 'equipment', name: 'Commercial mower', qty: '1 unit', level: 72, band: 'ok', emoji: '🛞', asOfMonth: '2026-04' },
];

function bandFromLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 'ok';
  return n < 30 ? 'low' : 'ok';
}

export default function InventoryPage() {
  const [items, setItems] = useState(() => DEMO_STOCK.map((x) => ({ ...x })));
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [bandFilter, setBandFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState('consumable');
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addLevel, setAddLevel] = useState('50');
  const [addEmoji, setAddEmoji] = useState('📦');
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [editLevel, setEditLevel] = useState('50');

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
    setAddLevel('50');
    setAddEmoji('📦');
  }, []);

  function handleAddSubmit(e) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    const qty = addQty.trim() || '—';
    const level = Math.min(100, Math.max(0, Number(addLevel) || 0));
    const band = bandFromLevel(level);
    const emoji = addEmoji.trim() || (addKind === 'equipment' ? '🔧' : '📦');
    setItems((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, kind: addKind, name, qty, level, band, emoji },
    ]);
    closeModal();
  }

  function openEditStock(row) {
    setEditId(row.id);
    setEditQty(row.qty ?? '');
    setEditLevel(String(row.level ?? 0));
    setEditOpen(true);
  }

  function closeEditModal() {
    setEditOpen(false);
    setEditId(null);
    setEditQty('');
    setEditLevel('50');
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    if (editId == null) return;
    const qty = editQty.trim() || '—';
    const level = Math.min(100, Math.max(0, Number(editLevel) || 0));
    const band = bandFromLevel(level);
    setItems((prev) =>
      prev.map((it) => (it.id === editId ? { ...it, qty, level, band } : it))
    );
    closeEditModal();
  }

  const editingRow = editId != null ? items.find((it) => it.id === editId) : null;

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
            Consumables and equipment in one register — local until your inventory API is connected.
          </p>
        </div>
        <div className="inventory-header-actions">
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <i className="fas fa-plus" aria-hidden /> Add item
          </button>
        </div>
      </header>

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
            <p className="inventory-section-desc">Levels, condition proxy (%), and quick updates</p>
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
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => openEditStock(row)}>
                          <i className="fas fa-sliders-h" aria-hidden /> Update
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {addOpen && (
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
                <p className="rooms-events-modal-sub">Consumable or equipment — stored locally until API is connected</p>
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
                      const k = e.target.value;
                      setAddKind(k);
                      if (k === 'equipment' && addEmoji === '📦') setAddEmoji('🔧');
                      if (k === 'consumable' && addEmoji === '🔧') setAddEmoji('📦');
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
                  <label className="form-label">Stock level (0–100%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="form-control"
                    value={addLevel}
                    onChange={(e) => setAddLevel(e.target.value)}
                    style={{ maxWidth: 160 }}
                  />
                  <small className="text-muted">Below 30% flags as low stock</small>
                </div>
                <div className="form-group">
                  <label className="form-label">Icon (emoji)</label>
                  <input className="form-control" value={addEmoji} onChange={(e) => setAddEmoji(e.target.value)} maxLength={4} style={{ maxWidth: 100 }} />
                </div>
                <div className="bookings-add-internal-actions">
                  <button type="button" className="btn btn-outline" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Add to list
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editOpen && editingRow && (
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
                  <label className="form-label">Stock level (0–100%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="form-control"
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    style={{ maxWidth: 160 }}
                  />
                  <small className="text-muted">Below 30% flags as low stock</small>
                </div>
                <div className="bookings-add-internal-actions">
                  <button type="button" className="btn btn-outline" onClick={closeEditModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save changes
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
