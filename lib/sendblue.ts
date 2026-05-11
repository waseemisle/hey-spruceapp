/**
 * SMS helper — delegates to Blooio (replaces the old SendBlue integration).
 * Keeps the same exported interface so existing callers work without changes.
 */
import { sendBlooioSms } from '@/lib/messaging/blooio';

export async function sendSMS({
  to,
  content,
}: {
  to: string;
  content: string;
  mediaUrl?: string;
  sendStyle?: string;
  statusCallback?: string;
}): Promise<{ status: string; message_handle: string }> {
  const result = await sendBlooioSms({ to, text: content });
  return {
    status: result.status,
    message_handle: result.providerMessageId || '',
  };
}
