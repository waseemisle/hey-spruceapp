/**
 * Canonical human-facing invoice id: INV- + last 8 digits of current time (matches admin "new invoice" / work order flows).
 */
export function generateInvoiceNumber(): string {
  return `INV-${Date.now().toString().slice(-8)}`;
}

/** True if the value already matches the canonical INV-######## pattern. */
export function isCanonicalInvoiceNumber(value: unknown): value is string {
  return typeof value === 'string' && /^INV-\d{8}$/.test(value);
}
