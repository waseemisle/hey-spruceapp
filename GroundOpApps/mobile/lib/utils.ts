// cn() helper — className merge (no tailwind-merge needed on RN; NativeWind handles conflicts)
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  if (val?.seconds) return new Date(val.seconds * 1000);
  return null;
}

export function formatDate(val: any, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const d = toDate(val);
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}

export function formatDateTime(val: any): string {
  return formatDate(val, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Phone → E.164. Mirrors web lib/sendblue.ts + lib/twilio.ts behavior. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function initialsFromName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
