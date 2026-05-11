import { normalizeToE164, toMetaWhatsAppFormat } from './phone';
import { findRecentMessageByIdempotencyKey } from './logger';
import type { SendChannelResult } from './types';

export interface WaTemplateParam {
  type: 'text';
  text: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendMetaWhatsApp(opts: {
  to: string;
  template?: { name: string; language?: string; bodyParams?: WaTemplateParam[] };
  text?: string;
  idempotencyKey?: string;
}): Promise<SendChannelResult> {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.META_WHATSAPP_API_VERSION || 'v23.0';

  if (!accessToken || !phoneNumberId) {
    return { success: false, status: 'failed', error: 'WhatsApp not configured' };
  }

  const e164 = normalizeToE164(opts.to);
  if (!e164) {
    return { success: false, status: 'failed', error: 'Invalid phone number' };
  }

  // App-level dedup for WhatsApp (no idempotency header support)
  if (opts.idempotencyKey) {
    const cached = await findRecentMessageByIdempotencyKey('whatsapp', opts.idempotencyKey);
    if (cached) {
      return {
        success: cached.status !== 'failed',
        status: cached.status,
        providerMessageId: cached.providerMessageId,
        error: 'Deduplicated — recent send found',
      };
    }
  }

  const waTo = toMetaWhatsAppFormat(e164);
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };

  let bodyObj: Record<string, any>;
  if (opts.template) {
    const langCode = opts.template.language || 'en';
    bodyObj = {
      messaging_product: 'whatsapp',
      to: waTo,
      type: 'template',
      template: {
        name: opts.template.name,
        language: { code: langCode },
        ...(opts.template.bodyParams?.length
          ? {
              components: [
                {
                  type: 'body',
                  parameters: opts.template.bodyParams,
                },
              ],
            }
          : {}),
      },
    };
  } else {
    bodyObj = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: waTo,
      type: 'text',
      text: { preview_url: false, body: opts.text || '' },
    };
  }

  async function attempt(): Promise<SendChannelResult> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status >= 500) {
        const errMsg = data?.error?.message || `Meta ${res.status}`;
        return { success: false, status: 'failed', error: errMsg, raw: data };
      }

      if (!res.ok) {
        const code = data?.error?.code;
        const msg = data?.error?.message || `Meta ${res.status}`;
        return {
          success: false,
          status: 'failed',
          error: `(${code ?? res.status}) ${msg}`,
          raw: data,
        };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      return {
        success: true,
        status: 'sent',
        providerMessageId,
        raw: data,
      };
    } catch (err: any) {
      return { success: false, status: 'failed', error: err?.message || String(err) };
    }
  }

  const first = await attempt();
  if (!first.success && first.raw && (first.raw as any)?.error) {
    const httpStatus = (first.raw as any)?.error?.http_status;
    if (typeof httpStatus === 'number' && httpStatus >= 500) {
      await sleep(5000);
      return attempt();
    }
  }
  return first;
}
