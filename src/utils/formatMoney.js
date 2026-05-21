/** en-ZA money: always show cents (no rounding to whole rand). */
const MONEY_OPTS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/**
 * @param {unknown} n
 * @returns {string}
 */
export function fmtRand(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `R ${Number(n).toLocaleString('en-ZA', MONEY_OPTS)}`;
}

/**
 * Compact axis labels — keeps 2 decimal places in K/M suffixes.
 * @param {unknown} n
 * @returns {string}
 */
export function fmtRandCompact(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const compactOpts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (abs >= 1_000_000) {
    return `${sign}R${(abs / 1_000_000).toLocaleString('en-ZA', compactOpts)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}R${(abs / 1_000).toLocaleString('en-ZA', compactOpts)}K`;
  }
  return fmtRand(v);
}

/**
 * @param {unknown} n
 * @param {{ minFraction?: number, maxFraction?: number }} [opts]
 * @returns {string}
 */
export function fmtNumber(n, opts = {}) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  const min = opts.minFraction ?? 0;
  const max = opts.maxFraction ?? 2;
  return Number(n).toLocaleString('en-ZA', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/**
 * @param {unknown} n
 * @returns {string}
 */
export function fmtPercent(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}
