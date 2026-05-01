/**
 * Single source of truth for displaying money in the UI.
 *
 * Always renders to exactly 2 decimal places with thousands separators —
 * "$1,234.56", "$0.00", "$12.50". Use this everywhere money is shown to
 * the user (invoice totals, line item amounts, quote amounts, work order
 * estimates, paid amounts, etc.) so totals never appear as "$40" or
 * "$1234" on one screen and "$40.00" on another.
 */

/** Coerce anything to a number, returning null if it's not finite. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Format a number as "$1,234.56" — always 2 decimals, always thousands
 * separators. Returns "$0.00" for null/undefined/NaN/Infinity so callers
 * never have to guard against missing values themselves.
 */
export function formatMoney(value: unknown): string {
  const n = toFiniteNumber(value);
  if (n === null) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Same as formatMoney but for cases where the number is already known to
 * be a finite, valid amount and the caller wants to handle missing values
 * differently (e.g. show a dash instead of $0.00). Returns the bare
 * "1,234.56" string with no $ prefix — useful inside templates that
 * already render the dollar sign separately.
 */
export function formatMoneyAmount(value: unknown): string {
  const n = toFiniteNumber(value);
  if (n === null) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
