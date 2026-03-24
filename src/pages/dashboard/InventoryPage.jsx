export default function InventoryPage() {
  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Inventory & Equipment</div>
          <div className="page-subtitle">Stock levels and asset register</div>
        </div>
        <button type="button" className="btn btn-primary"><i className="fas fa-plus" /> Add Item</button>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Consumables Stock</div></div>
        <div className="card-body">
          <div className="stock-row">
            <div className="stock-icon">🧻</div>
            <div><div className="stock-name">Toilet Paper Rolls</div><div className="stock-qty">6 units</div></div>
            <div className="stock-level"><div className="progress-bar"><div className="progress-fill red" style={{ width: '12%' }} /></div></div>
            <span className="badge badge-low">LOW</span>
          </div>
        </div>
      </div>
    </>
  );
}
