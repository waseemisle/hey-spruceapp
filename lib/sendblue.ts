/**
 * SendBlue SMS/iMessage helper — sends messages via SendBlue's REST API.
 *
 * Required env vars:
 *   SENDBLUE_API_KEY     — from your SendBlue dashboard
 *   SENDBLUE_API_SECRET  — from your SendBlue dashboard
 *   SENDBLUE_FROM_NUMBER — your registered SendBlue phone number (E.164)
 */

/** Normalize a phone string to E.164 format (e.g. "+12025551234"). */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export async function sendSMS({
  to,
  content,
  mediaUrl,
  sendStyle,
  statusCallback,
}: {
  to: string;
  content: string;
  mediaUrl?: string;
  sendStyle?: string;
  statusCallback?: string;
}): Promise<{ status: string; message_handle: string }> {
  const apiKey = process.env.SENDBLUE_API_KEY;
  const apiSecret = process.env.SENDBLUE_API_SECRET;
  const fromNumber = process.env.SENDBLUE_FROM_NUMBER;

  if (!apiKey || !apiSecret || !fromNumber) {
    throw new Error(
      'SendBlue is not configured. Set SENDBLUE_API_KEY, SENDBLUE_API_SECRET, and SENDBLUE_FROM_NUMBER in your environment variables.'
    );
  }

  const body: Record<string, string> = {
    number: normalizePhone(to),
    from_number: fromNumber,
    content,
  };

  if (mediaUrl) body.media_url = mediaUrl;
  if (sendStyle) body.send_style = sendStyle;
  if (statusCallback) body.status_callback = statusCallback;

  const response = await fetch('https://api.sendblue.co/api/send-message', {
    method: 'POST',
    headers: {
      'sb-api-key-id': apiKey,
      'sb-api-secret-key': apiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `SendBlue API error ${data.error_code || response.status}: ${data.error_message || data.message || 'Unknown error'}`
    );
  }

  return {
    status: data.status,
    message_handle: data.message_handle,
  };
}
