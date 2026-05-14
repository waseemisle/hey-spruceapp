import { normalizeToE164 } from './phone';
import type { MessageStatus, SendChannelResult } from './types';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map Blooio send or GET /status JSON to our log status (shared POST + poll). */
export function mapBlooioPayloadToStatus(data: unknown): MessageStatus {
  if (!data || typeof data !== 'object') return 'sent';
  const o = data as Record<string, unknown>;
  const providerStatus = String(o.status ?? '').toLowerCase();
  const deliveryHint = String(
    o.delivery_status ?? o.deliveryStatus ?? o.delivery_state ?? '',
  ).toLowerCase();

  const isDelivered =
    providerStatus === 'delivered' ||
    deliveryHint === 'delivered' ||
    deliveryHint === 'delivery_success';

  if (providerStatus === 'failed' || providerStatus === 'error') return 'failed';
  if (isDelivered) return 'delivered';
  if (providerStatus === 'sent') return 'sent';
  if (
    providerStatus === 'queued' ||
    providerStatus === 'pending' ||
    providerStatus === 'processing' ||
    providerStatus === 'submitted'
  ) {
    return 'sent';
  }
  return 'sent';
}

/**
 * GET /chats/{chatId}/messages/{messageId}/status — see Blooio "Message status lifecycle".
 */
export async function fetchBlooioMessageStatus(
  e164: string,
  messageId: string,
): Promise<{ status: MessageStatus; raw: unknown } | null> {
  const apiKey = process.env.BLOOIO_API_KEY;
  const baseUrl = process.env.BLOOIO_BASE_URL || 'https://backend.blooio.com/v2/api';
  if (!apiKey || !messageId) return null;
  const chatId = encodeURIComponent(e164);
  const mid = encodeURIComponent(messageId);
  const url = `${baseUrl}/chats/${chatId}/messages/${mid}/status`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return { status: mapBlooioPayloadToStatus(data), raw: data };
  } catch {
    return null;
  }
}

/**
 * Poll Blooio until delivered/failed or timeout. Updates logs when POST still shows queued/sent.
 * Disable with BLOOIO_SKIP_DELIVERY_POLL=true. Tune with BLOOIO_DELIVERY_POLL_MAX_MS (default 5000).
 */
export async function pollBlooioSmsUntilTerminal(
  e164: string,
  messageId: string,
  opts?: { maxMs?: number; intervalMs?: number },
): Promise<{ status: MessageStatus; raw: unknown } | null> {
  if (process.env.BLOOIO_SKIP_DELIVERY_POLL === 'true') return null;
  const envMs = Number(process.env.BLOOIO_DELIVERY_POLL_MAX_MS);
  const defaultMax = Number.isFinite(envMs) && envMs > 0 ? envMs : 5000;
  const maxMs = opts?.maxMs ?? defaultMax;
  const intervalMs = opts?.intervalMs ?? 400;
  const deadline = Date.now() + maxMs;
  let last: { status: MessageStatus; raw: unknown } | null = null;
  while (Date.now() < deadline) {
    last = await fetchBlooioMessageStatus(e164, messageId);
    if (last && (last.status === 'delivered' || last.status === 'failed')) return last;
    await sleep(intervalMs);
  }
  return last;
}

/** Send SMS then poll Blooio status endpoint so logs reflect real delivery when available. */
export async function sendBlooioSmsWithDeliveryPoll(opts: {
  to: string;
  text: string;
  idempotencyKey?: string;
  fromNumber?: string;
}): Promise<SendChannelResult> {
  const r = await sendBlooioSms(opts);
  const e164 = normalizeToE164(opts.to);
  if (!r.success || !r.providerMessageId || !e164) return r;
  const polled = await pollBlooioSmsUntilTerminal(e164, r.providerMessageId);
  if (!polled) return r;
  return {
    ...r,
    status: polled.status,
    raw:
      r.raw != null && polled.raw != null
        ? { blooioSend: r.raw, blooioStatusPoll: polled.raw }
        : (polled.raw ?? r.raw),
  };
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

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const status = mapBlooioPayloadToStatus(data);

      return {
        success: status !== 'failed',
        status,
        providerMessageId: (data.id ?? data.message_id) as string | undefined,
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
