/** Returns +<digits> or null if input can't be normalized. */
export function normalizeToE164(phone: string, defaultCountry: 'US' | 'PK' = 'US'): string | null {
  if (!phone) return null;
  // Strip everything except digits and leading +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Already E.164: + followed by 8–15 digits
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;

  // Digits only
  const digitsOnly = cleaned.replace(/^\+/, '');

  // 10 digits + US default → +1XXXXXXXXXX
  if (digitsOnly.length === 10 && defaultCountry === 'US') return `+1${digitsOnly}`;

  // 10 digits + PK default → +92XXXXXXXXXX (but PK local is 10 digits without country code)
  if (digitsOnly.length === 10 && defaultCountry === 'PK') return `+92${digitsOnly}`;

  // 11–15 digits no + → likely already has country code
  if (digitsOnly.length >= 11 && digitsOnly.length <= 15) return `+${digitsOnly}`;

  return null;
}

export function looksLikeE164(phone: string): boolean {
  return /^\+\d{8,15}$/.test(phone.trim());
}

/** Meta WhatsApp wants digits-only (no leading +). */
export function toMetaWhatsAppFormat(e164: string): string {
  return e164.replace(/^\+/, '');
}
