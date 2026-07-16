/**
 * Warm highlight strip — shared across public marketing pages.
 * @param {{ items: Array<{ icon: string, label: string }> }} props
 */
export default function PageHighlights({ items }) {
  if (!items?.length) return null;
  return (
    <div className="page-highlights" role="list">
      {items.map((item) => (
        <div key={item.label} className="page-highlight" role="listitem">
          <span className="page-highlight-icon" aria-hidden="true">
            <i className={`fas ${item.icon}`} />
          </span>
          <span className="page-highlight-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
