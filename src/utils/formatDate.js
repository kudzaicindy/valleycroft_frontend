/** Locale used for all user-visible dates (South Africa, English). */
export const DATE_DISPLAY_LOCALE = 'en-ZA';

/**
 * Calendar date as day + full month + year, e.g. "14 March 2026".
 * @param {string | number | Date | null | undefined} value
 * @returns {string}
 */
export function formatDateDayMonthYear(value) {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  return d.toLocaleDateString(DATE_DISPLAY_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Month and year only, e.g. "March 2026".
 * @param {string | number | Date | null | undefined} value
 * @returns {string}
 */
export function formatMonthYear(value) {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  return d.toLocaleDateString(DATE_DISPLAY_LOCALE, { month: 'long', year: 'numeric' });
}

/**
 * Weekday + day + full month + year, e.g. "Tuesday, 24 March 2026".
 * @param {string | number | Date | null | undefined} [value]
 * @returns {string}
 */
export function formatDateWeekdayDayMonthYear(value) {
  const d =
    value == null || value === ''
      ? new Date()
      : value instanceof Date
        ? value
        : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(DATE_DISPLAY_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
