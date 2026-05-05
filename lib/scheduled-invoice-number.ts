/**
 * Canonical human-facing scheduled-invoice id: SI- + last 8 digits of
 * current time. Mirrors `lib/invoice-number.ts` so the two id spaces
 * read identically in lists / emails / PDFs and never collide.
 */
export function generateScheduledInvoiceNumber(): string {
  return `SI-${Date.now().toString().slice(-8)}`;
}

export function isCanonicalScheduledInvoiceNumber(value: unknown): value is string {
  return typeof value === 'string' && /^SI-\d{8}$/.test(value);
}
