/**
 * Client-portal currency formatting.
 *
 * Renders a USD amount with exactly two decimal places and en-US thousands
 * separators — "$1,234.00", "$0.50", "$987,654.32".
 *
 * Used everywhere a money figure is shown to the client (invoice totals,
 * quote breakdowns, work-order estimates, etc.) so accounting-style
 * displays never collapse to "$1,234" on one screen and "$1,234.00" on
 * another.
 */
export function formatUsd2(amount: unknown): string {
  const n =
    typeof amount === 'number'
      ? amount
      : typeof amount === 'string'
        ? Number(amount)
        : NaN;
  const safe = Number.isFinite(n) ? (n as number) : 0;
  return `$${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
