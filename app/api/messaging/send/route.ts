import { NextResponse } from 'next/server';
import { resolveMessagingTargets } from '@/lib/messaging/settings';
import { sendBlooioSms } from '@/lib/messaging/blooio';
import { sendMetaWhatsApp } from '@/lib/messaging/meta-whatsapp';
import { logMessage } from '@/lib/messaging/logger';
import {
  subcontractorApprovalText,
  biddingOpportunityText,
  quoteApprovedText,
  testMessageText,
  mapEventToTemplate,
} from '@/lib/messaging/templates';
import { normalizeToE164 } from '@/lib/messaging/phone';
import { getBaseUrl } from '@/lib/base-url';
import type { MessageChannel, MessageEventType, MessageStatus } from '@/lib/messaging/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SendResult {
  channel: MessageChannel;
  status: MessageStatus;
  skipReason?: string;
  providerMessageId?: string;
  error?: string;
}

function buildIdempotencyKey(
  type: MessageEventType,
  channel: MessageChannel,
  ctx: Record<string, any>,
  subcontractorId?: string,
): string {
  switch (type) {
    case 'subcontractor-approval':
      return `subapr-${subcontractorId}-${channel}`;
    case 'bidding-opportunity':
      return `bidop-${ctx.workOrderId || ctx.workOrderNumber}-${subcontractorId}-${channel}`;
    case 'quote-approved':
      return `quoteapr-${ctx.quoteId}-${subcontractorId}-${channel}`;
    default:
      return `${type}-${subcontractorId}-${channel}-${Date.now()}`;
  }
}

function buildBody(
  type: MessageEventType,
  ctx: Record<string, any>,
  channel: MessageChannel,
): string {
  const portalUrl = `${getBaseUrl()}/portal-login`;
  switch (type) {
    case 'subcontractor-approval':
      return subcontractorApprovalText({
        toName: ctx.toName || '',
        businessName: ctx.businessName,
        portalUrl,
      });
    case 'bidding-opportunity':
      return biddingOpportunityText({
        toName: ctx.toName || '',
        workOrderNumber: ctx.workOrderNumber || '',
        workOrderTitle: ctx.workOrderTitle || '',
        portalUrl: `${getBaseUrl()}/subcontractor-portal/bidding`,
      });
    case 'quote-approved':
      return quoteApprovedText({
        toName: ctx.toName || '',
        workOrderNumber: ctx.workOrderNumber || '',
        workOrderTitle: ctx.workOrderTitle || '',
        portalUrl: `${getBaseUrl()}/subcontractor-portal/bidding`,
      });
    case 'test':
      return testMessageText({ fromAdmin: ctx.fromAdmin || 'Admin', channel });
    default:
      return `GroundOps notification: ${type}`;
  }
}

export async function POST(request: Request) {
  const results: SendResult[] = [];

  try {
    const body = await request.json().catch(() => ({}));
    const {
      type,
      subcontractorId,
      channels: requestedChannels,
      context = {},
      testPhone,
      testFromAdmin,
    } = body as {
      type: MessageEventType;
      subcontractorId?: string;
      channels?: MessageChannel[];
      context?: Record<string, any>;
      testPhone?: string;
      testFromAdmin?: string;
    };

    if (!type) {
      return NextResponse.json({ success: false, error: 'Missing type' }, { status: 400 });
    }

    const allChannels: MessageChannel[] = ['sms', 'whatsapp'];
    const channelsToTry = requestedChannels?.length ? requestedChannels : allChannels;

    // ── TEST MODE ──────────────────────────────────────────────────────────
    if (type === 'test') {
      const phone = testPhone || '+923212134142';
      const e164 = normalizeToE164(phone);
      const fromAdmin = testFromAdmin || 'Admin';

      for (const channel of channelsToTry) {
        const ikey = `test-${channel}-${phone}-${Date.now()}`;
        const msgBody = buildBody('test', { fromAdmin }, channel);

        if (channel === 'sms') {
          if (!process.env.BLOOIO_API_KEY) {
            results.push({ channel, status: 'skipped', skipReason: 'provider-not-configured' });
            continue;
          }
          if (!e164) {
            results.push({ channel, status: 'failed', error: 'Invalid phone number' });
            continue;
          }
          const r = await sendBlooioSms({ to: e164, text: msgBody, idempotencyKey: ikey });
          await logMessage({
            channel: 'sms',
            provider: 'blooio',
            type: 'test',
            to: e164,
            toName: fromAdmin,
            recipientRole: 'admin',
            body: msgBody,
            status: r.status,
            providerMessageId: r.providerMessageId,
            context: { fromAdmin, testPhone: phone },
            error: r.error,
            idempotencyKey: ikey,
          });
          results.push({ channel, status: r.status, providerMessageId: r.providerMessageId, error: r.error });
        } else {
          if (!process.env.META_WHATSAPP_ACCESS_TOKEN || !process.env.META_WHATSAPP_PHONE_NUMBER_ID) {
            results.push({ channel, status: 'skipped', skipReason: 'provider-not-configured' });
            continue;
          }
          if (!e164) {
            results.push({ channel, status: 'failed', error: 'Invalid phone number' });
            continue;
          }
          // For test, try plain text first; if 131047 (outside 24h window), note it
          const r = await sendMetaWhatsApp({ to: e164, text: msgBody, idempotencyKey: ikey });
          // If outside 24h window error and test_message_v1 template exists, retry with template
          let finalResult = r;
          if (!r.success && r.error?.includes('131047')) {
            const tplRetry = await sendMetaWhatsApp({
              to: e164,
              template: { name: 'test_message_v1', language: 'en', bodyParams: [{ type: 'text', text: channel }] },
              idempotencyKey: ikey + '-tpl',
            });
            if (tplRetry.success) finalResult = tplRetry;
          }
          await logMessage({
            channel: 'whatsapp',
            provider: 'meta-whatsapp',
            type: 'test',
            to: e164,
            toName: fromAdmin,
            recipientRole: 'admin',
            body: msgBody,
            status: finalResult.status,
            providerMessageId: finalResult.providerMessageId,
            context: { fromAdmin, testPhone: phone },
            error: finalResult.error,
            idempotencyKey: ikey,
          });
          results.push({ channel, status: finalResult.status, providerMessageId: finalResult.providerMessageId, error: finalResult.error });
        }
      }

      return NextResponse.json({ success: true, results });
    }

    // ── REAL EVENT MODE ────────────────────────────────────────────────────
    if (!subcontractorId) {
      return NextResponse.json({ success: false, error: 'Missing subcontractorId' }, { status: 400 });
    }

    const resolved = await resolveMessagingTargets({ type, subcontractorId });
    const portalUrl = `${getBaseUrl()}/portal-login`;
    const biddingUrl = `${getBaseUrl()}/subcontractor-portal/bidding`;

    for (const decision of resolved.decisions) {
      const { channel } = decision;
      if (!channelsToTry.includes(channel)) continue;

      if (!decision.allowed) {
        await logMessage({
          channel,
          provider: channel === 'sms' ? 'blooio' : 'meta-whatsapp',
          type,
          to: resolved.resolvedPhone || '',
          toName: resolved.subName,
          recipientRole: 'subcontractor',
          recipientId: subcontractorId,
          body: '',
          status: 'skipped',
          context,
          error: decision.reason,
        });
        results.push({ channel, status: 'skipped', skipReason: decision.reason });
        continue;
      }

      const phone = resolved.resolvedPhone!;
      const toName = resolved.subName || context.toName || '';

      // Build message body
      const enrichedCtx = {
        ...context,
        toName,
        portalUrl: type === 'bidding-opportunity' ? biddingUrl : portalUrl,
      };
      const msgBody = buildBody(type, enrichedCtx, channel);
      const ikey = buildIdempotencyKey(type, channel, context, subcontractorId);

      if (channel === 'sms') {
        const r = await sendBlooioSms({ to: phone, text: msgBody, idempotencyKey: ikey });
        await logMessage({
          channel: 'sms',
          provider: 'blooio',
          type,
          to: phone,
          toName,
          recipientRole: 'subcontractor',
          recipientId: subcontractorId,
          body: msgBody,
          status: r.status,
          providerMessageId: r.providerMessageId,
          context: enrichedCtx,
          error: r.error,
          idempotencyKey: ikey,
        });
        results.push({ channel, status: r.status, providerMessageId: r.providerMessageId, error: r.error });
      } else {
        const templateMapping = mapEventToTemplate(type);
        let r;
        if (templateMapping) {
          r = await sendMetaWhatsApp({
            to: phone,
            template: {
              name: templateMapping.name,
              language: templateMapping.languageCode,
              bodyParams: templateMapping.buildBodyParams(enrichedCtx),
            },
            idempotencyKey: ikey,
          });
        } else {
          r = await sendMetaWhatsApp({ to: phone, text: msgBody, idempotencyKey: ikey });
        }
        await logMessage({
          channel: 'whatsapp',
          provider: 'meta-whatsapp',
          type,
          to: phone,
          toName,
          recipientRole: 'subcontractor',
          recipientId: subcontractorId,
          body: msgBody,
          status: r.status,
          providerMessageId: r.providerMessageId,
          context: enrichedCtx,
          error: r.error,
          idempotencyKey: ikey,
        });
        results.push({ channel, status: r.status, providerMessageId: r.providerMessageId, error: r.error });
      }
    }
  } catch (err: any) {
    console.error('[/api/messaging/send] unhandled error:', err?.message);
    results.push({ channel: 'sms', status: 'failed', error: err?.message || 'Internal error' });
  }

  return NextResponse.json({ success: true, results });
}
