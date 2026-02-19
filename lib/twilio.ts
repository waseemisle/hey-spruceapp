/**
 * Twilio WhatsApp helper — uses Twilio's REST API directly (no npm package needed).
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID   — from your Twilio Console dashboard
 *   TWILIO_AUTH_TOKEN    — from your Twilio Console dashboard
 *   TWILIO_WHATSAPP_FROM — the WhatsApp-enabled number, e.g. "whatsapp:+14155238886"
 *                          (use the Sandbox number for testing, your approved number for production)
 */

/** Normalize a phone string to E.164 format (e.g. "+12025551234"). */
function normalizePhone(phone: string): string {
  // Strip everything except digits and leading +
  const digits = phone.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) return digits;

  // US/Canada: 10 digits → add +1
  if (digits.length === 10) return `+1${digits}`;

  // Already has country code (11+ digits) → add +
  return `+${digits}`;
}

export async function sendWhatsApp({
  to,
  body,
}: {
  to: string;
  body: string;
}): Promise<{ sid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in your environment variables.'
    );
  }

  const toWhatsApp = to.startsWith('whatsapp:') ? to : `whatsapp:${normalizePhone(to)}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const params = new URLSearchParams({
    From: fromNumber,
    To: toWhatsApp,
    Body: body,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Twilio API error ${data.code || response.status}: ${data.message || 'Unknown error'}`
    );
  }

  return { sid: data.sid };
}
