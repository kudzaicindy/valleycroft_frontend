/**
 * Standard document header for finance statements.
 */
export function FinanceStatementHeader({ title, subtitle, periodLabel }) {
  return (
    <header className="finance-stmt-doc-header">
      <h1 className="finance-stmt-doc-title">{title}</h1>
      {subtitle && <p className="finance-stmt-doc-sub">{subtitle}</p>}
      {periodLabel && <p className="finance-stmt-doc-period">{periodLabel}</p>}
    </header>
  );
}

/** Year selector + optional right slot (e.g. balance sheet period). */
export function FinanceYearToolbar({ year, onYearChange, yearOptions: years, children }) {
  return (
    <div className="finance-stmt-toolbar">
      <label className="finance-stmt-toolbar-label">
        <span>Year</span>
        <select className="form-control finance-stmt-select" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      {children}
    </div>
  );
}

/** Horizontal scroll wrapper for wide monthly grids */
export function FinanceMonthlyTableWrap({ children }) {
  return <div className="finance-stmt-monthly-scroll">{children}</div>;
}
