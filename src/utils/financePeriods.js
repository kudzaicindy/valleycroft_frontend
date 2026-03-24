/** Short month labels for statement column headers */
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function padDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Full calendar year (inclusive). */
export function yearRange(year) {
  const y = Number(year);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** First and last calendar day of month (monthIndex 0–11). */
export function monthRange(year, monthIndex) {
  const y = Number(year);
  const mi = Number(monthIndex);
  const start = new Date(y, mi, 1);
  const end = new Date(y, mi + 1, 0);
  return { start: padDate(start), end: padDate(end) };
}

/** Last day of month as YYYY-MM-DD */
export function endOfMonthDate(year, monthIndex) {
  return monthRange(year, monthIndex).end;
}

const currentYear = () => new Date().getFullYear();

export function defaultReportYear() {
  return currentYear();
}

/** Year options for dropdowns */
export function yearOptions({ back = 6, forward = 1 } = {}) {
  const cy = currentYear();
  const out = [];
  for (let y = cy - back; y <= cy + forward; y += 1) out.push(y);
  return out;
}
