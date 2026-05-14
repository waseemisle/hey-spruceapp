import { normalizeToE164 } from './phone';
import type { SendChannelResult } from './types';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendBlooioSms(opts: {
  to: string;
  text: string;
  idempotencyKey?: string;
  fromNumber?: string;
}): Promise<SendChannelResult> {
  const apiKey = process.env.BLOOIO_API_KEY;
  const baseUrl = process.env.BLOOIO_BASE_URL || 'https://backend.blooio.com/v2/api';
  const fromNumber = opts.fromNumber || process.env.BLOOIO_FROM_NUMBER;

  if (!apiKey) {
    return { success: false, status: 'failed', error: 'Blooio not configured' };
  }

  const e164 = normalizeToE164(opts.to);
  if (!e164) {
    return { success: false, status: 'failed', error: 'Invalid phone number' };
  }

  const chatId = encodeURIComponent(e164);
  const url = `${baseUrl}/chats/${chatId}/messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  const body = JSON.stringify({
    text: opts.text,
    ...(fromNumber ? { from_number: fromNumber } : {}),
  });

  async function attempt(): Promise<SendChannelResult> {
    try {
      const res = await fetch(url, { method: 'POST', headers, body });

      if (res.status === 503) {
        return { success: false, status: 'failed', error: 'Blooio 503: no active sender', raw: null };
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, status: 'failed', error: `Blooio ${res.status}: ${text}` };
      }

      const data = await res.json().catch(() => ({}));

      const providerStatus = String(data?.status ?? '').toLowerCase();
      const deliveryHint = String(
        (data as Record<string, unknown>)?.delivery_status ??
          (data as Record<string, unknown>)?.deliveryStatus ??
          (data as Record<string, unknown>)?.delivery_state ??
          '',
      ).toLowerCase();

      const isDelivered =
        providerStatus === 'delivered' ||
        deliveryHint === 'delivered' ||
        deliveryHint === 'delivery_success';

      let status: SendChannelResult['status'];
      if (providerStatus === 'failed' || providerStatus === 'error') {
        status = 'failed';
      } else if (isDelivered) {
        status = 'delivered';
      } else if (providerStatus === 'sent') {
        status = 'sent';
      } else if (
        providerStatus === 'queued' ||
        providerStatus === 'pending' ||
        providerStatus === 'processing' ||
        providerStatus === 'submitted'
      ) {
        // Accepted for dispatch — not waiting on GroundOps.
        status = 'sent';
      } else {
        status = 'sent';
      }

      return {
        success: status !== 'failed',
        status,
        providerMessageId: data?.id || data?.message_id || undefined,
        raw: data,
      };
    } catch (err: any) {
      return { success: false, status: 'failed', error: err?.message || String(err) };
    }
  }

  const first = await attempt();
  if (first.status !== 'failed' || !first.error?.includes('503')) {
    return first;
  }

  // One retry after 5s on 503
  await sleep(5000);
  return attempt();
}
