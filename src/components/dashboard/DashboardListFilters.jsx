import { Fragment } from 'react';

/**
 * Search + month filter bar aligned with Worker payments (Salary) styling.
 * @param {{ embedded?: boolean }} [props] When true, omits outer `bookings-filters-bar` (for nesting inside an existing filter row).
 */
export default function DashboardListFilters({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  month,
  onMonthChange,
  embedded = false,
}) {
  const inner = (
    <Fragment>
      <input
        type="search"
        className="form-control"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ maxWidth: 320 }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <span>Month</span>
        <input
          type="month"
          className="form-control"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          style={{ maxWidth: 160 }}
        />
      </label>
      {month ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onMonthChange('')}>
          Clear month
        </button>
      ) : null}
    </Fragment>
  );

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {inner}
      </div>
    );
  }

  return (
    <div
      className="bookings-filters-bar"
      style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
    >
      {inner}
    </div>
  );
}
