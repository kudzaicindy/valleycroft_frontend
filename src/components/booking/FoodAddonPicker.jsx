import {
  formatFoodAddonRate,
  foodAddonLineTotal,
} from '@/content/foodAddons';

function formatNum(n) {
  return n.toLocaleString('en-ZA');
}

/**
 * @param {{
 *   options: Array<{ id: string, label: string, chip: string, description: string, rate: number, unitLabel: string }>,
 *   selected: string[],
 *   onToggle: (id: string) => void,
 *   guestCount: number,
 *   nights?: number,
 *   className?: string,
 *   loading?: boolean,
 * }} props
 */
export default function FoodAddonPicker({
  options,
  selected,
  onToggle,
  guestCount,
  nights = 1,
  className = '',
  loading = false,
}) {
  const selectedSet = new Set(selected);
  const list = options?.length ? options : [];

  if (loading) {
    return (
      <div className={`food-addon-picker ${className}`.trim()}>
        <p className="food-addon-picker-lead">Loading food add-on prices…</p>
      </div>
    );
  }

  if (!list.length) {
    return null;
  }

  return (
    <div className={`food-addon-picker ${className}`.trim()}>
      <p className="food-addon-picker-lead">
        Need food during your stay? Breakfast and picnic setups are optional add-ons — select below to include an
        estimated cost in your booking.
      </p>
      <div className="food-addon-options">
        {list.map((opt) => {
          const on = selectedSet.has(opt.id);
          const lineTotal = foodAddonLineTotal(opt, guestCount, nights);
          return (
            <button
              key={opt.id}
              type="button"
              className={`food-addon-option ${on ? 'on' : ''}`}
              onClick={() => onToggle(opt.id)}
              aria-pressed={on}
            >
              <span className="food-addon-option-main">
                <span className="food-addon-option-label">{opt.chip}</span>
                <span className="food-addon-option-desc">{opt.description}</span>
              </span>
              <span className="food-addon-option-price">
                <span className="food-addon-option-rate">{formatFoodAddonRate(opt)}</span>
                {guestCount > 0 && on ? (
                  <span className="food-addon-option-line">+ R {formatNum(lineTotal)}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
