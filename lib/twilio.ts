/**
 * SMS helper — delegates to Blooio (replaces the old Twilio integration).
 * Keeps the same exported interface so existing callers work without changes.
 * Note: previously sent WhatsApp via Twilio; now sends SMS via Blooio.
 */
import { sendBlooioSms } from '@/lib/messaging/blooio';

export async function sendWhatsApp({
  to,
  body,
}: {
  to: string;
  body: string;
}): Promise<{ sid: string }> {
  const result = await sendBlooioSms({ to, text: body });
  return { sid: result.providerMessageId || '' };
}
