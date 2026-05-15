import { NextResponse } from 'next/server';
import { resolveMessagingTargets } from '@/lib/messaging/settings';
import { sendBlooioSmsWithDeliveryPoll } from '@/lib/messaging/blooio';
import { logMessage } from '@/lib/messaging/logger';
import {
  subcontractorApprovalText,
  biddingOpportunityText,
  quoteApprovedText,
  testMessageText,
  appendSmsOptOutFooter,
} from '@/lib/messaging/templates';
import { normalizeToE164 } from '@/lib/messaging/phone';
import type { MessageChannel, MessageEventType, MessageStatus } from '@/lib/messaging/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Allow Blooio delivery polling (several seconds) without platform cutting the request short. */
export const maxDuration = 60;

function pickProviderPayload(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const keys = [
    'status', 'state', 'delivery_status', 'deliveryStatus', 'error', 'message', 'code',
    'id', 'message_id', 'reason', 'failure_reason', 'blooioHttpStatus', 'blooioIdempotentReplay',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = o[k];
  }
  return Object.keys(out).length ? out : undefined;
}

/** After delivery poll, raw may be `{ blooioSend, blooioStatusPoll }` — surface both for SMS logs. */
function pickBlooioSmsLogPayload(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return pickProviderPayload(raw);
  const o = raw as Record<string, unknown>;
  if (o.blooioSend && o.blooioStatusPoll) {
    const send = pickProviderPayload(o.blooioSend);
    const poll = pickProviderPayload(o.blooioStatusPoll);
    const merged: Record<string, unknown> = {
      ...(send ?? {}),
      statusPoll: poll ?? undefined,
      deliveryConfirmedViaPoll: true,
    };
    return Object.keys(merged).some((k) => merged[k] !== undefined) ? merged : undefined;
  }
  return pickProviderPayload(raw);
}

interface SendResult {
  channel: MessageChannel;
  status: MessageStatus;
  skipReason?: string;
  providerMessageId?: string;
  error?: string;
}

function buildIdempotencyKey(
  type: MessageEventType,
  ctx: Record<string, any>,
  subcontractorId?: string,
): string {
  switch (type) {
    case 'subcontractor-approval':
      return `subapr-${subcontractorId}-sms`;
    case 'bidding-opportunity': {
      const wo = String(ctx.workOrderId || ctx.workOrderNumber || 'wo');
      const batch = ctx.shareBatchId ?? ctx.clientSendNonce ?? ctx.shareNonce;
      if (batch != null && String(batch).length > 0) {
        return `bidop-${wo}-${subcontractorId}-sms-${String(batch)}`;
      }
      // Server-only callers (no batch): unique per request so Blooio does not suppress SMS for 24h.
      return `bidop-${wo}-${subcontractorId}-sms-srv-${Date.now()}`;
    }
    case 'quote-approved':
      return `quoteapr-${ctx.quoteId}-${subcontractorId}-sms`;
    default:
      return `${type}-${subcontractorId}-sms-${Date.now()}`;
  }
}

function buildBody(
  type: MessageEventType,
  ctx: Record<string, any>,
): string {
  // URLs in SMS trigger carrier spam filters — omit portal URLs from all SMS bodies.
  switch (type) {
    case 'subcontractor-approval':
      return subcontractorApprovalText({
        toName: ctx.toName || '',
        businessName: ctx.businessName,
      });
    case 'bidding-opportunity':
      return biddingOpportunityText({
        toName: ctx.toName || '',
        workOrderNumber: ctx.workOrderNumber || '',
        workOrderTitle: ctx.workOrderTitle || '',
      });
    case 'quote-approved':
      return quoteApprovedText({
        toName: ctx.toName || '',
        workOrderNumber: ctx.workOrderNumber || '',
        workOrderTitle: ctx.workOrderTitle || '',
      });
    case 'test':
      return testMessageText({ fromAdmin: ctx.fromAdmin || 'Admin' });
    default:
      return `Ground Ops notification: ${type}`;
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
      channels?: string[];
      context?: Record<string, any>;
      testPhone?: string;
      testFromAdmin?: string;
    };

    if (!type) {
      return NextResponse.json({ success: false, error: 'Missing type' }, { status: 400 });
    }

    // Only 'sms' is supported; ignore any other channels
    const channelsToTry: MessageChannel[] = ['sms'];
    if (requestedChannels?.length && !requestedChannels.includes('sms')) {
      return NextResponse.json({ success: true, results });
    }

    // ── TEST MODE ──────────────────────────────────────────────────────────
    if (type === 'test') {
      if (!testPhone) {
        return NextResponse.json({ success: false, error: 'Missing testPhone' }, { status: 400 });
      }
      const phone = testPhone;
      const e164 = normalizeToE164(phone);
      const fromAdmin = testFromAdmin || 'Admin';

      const ikey = `test-sms-${phone}-${Date.now()}`;
      const msgBody = buildBody('test', { fromAdmin });

      if (!process.env.BLOOIO_API_KEY) {
        results.push({ channel: 'sms', status: 'skipped', skipReason: 'provider-not-configured' });
      } else if (!e164) {
        results.push({ channel: 'sms', status: 'failed', error: 'Invalid phone number' });
      } else {
        const smsText = appendSmsOptOutFooter(msgBody);
        const r = await sendBlooioSmsWithDeliveryPoll({ to: e164, text: smsText, idempotencyKey: ikey });
        await logMessage({
          channel: 'sms',
          provider: 'blooio',
          type: 'test',
          to: e164,
          toName: fromAdmin,
          recipientRole: 'admin',
          body: smsText,
          status: r.status,
          providerMessageId: r.providerMessageId,
          providerPayload: pickBlooioSmsLogPayload(r.raw),
          context: { fromAdmin, testPhone: phone },
          error: r.error,
          idempotencyKey: ikey,
        });
        results.push({
          channel: 'sms',
          status: r.status,
          providerMessageId: r.providerMessageId,
          error: r.error,
          skipReason: r.skipReason,
        });
      }

      return NextResponse.json({ success: true, results });
    }

    // ── REAL EVENT MODE ────────────────────────────────────────────────────
    if (!subcontractorId) {
      return NextResponse.json({ success: false, error: 'Missing subcontractorId' }, { status: 400 });
    }

    const resolved = await resolveMessagingTargets({ type, subcontractorId });

    for (const decision of resolved.decisions) {
      if (!decision.allowed) {
        await logMessage({
          channel: 'sms',
          provider: 'blooio',
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
        results.push({ channel: 'sms', status: 'skipped', skipReason: decision.reason });
        continue;
      }

      const phone = resolved.resolvedPhone!;
      const toName = resolved.subName || context.toName || '';
      const enrichedCtx = { ...context, toName };
      const msgBody = buildBody(type, enrichedCtx);
      const ikey = buildIdempotencyKey(type, context, subcontractorId);

      const smsText = appendSmsOptOutFooter(msgBody);
      const r = await sendBlooioSmsWithDeliveryPoll({ to: phone, text: smsText, idempotencyKey: ikey });
      await logMessage({
        channel: 'sms',
        provider: 'blooio',
        type,
        to: phone,
        toName,
        recipientRole: 'subcontractor',
        recipientId: subcontractorId,
        body: smsText,
        status: r.status,
        providerMessageId: r.providerMessageId,
        providerPayload: pickBlooioSmsLogPayload(r.raw),
        context: enrichedCtx,
        error: r.error,
        idempotencyKey: ikey,
      });
      results.push({
        channel: 'sms',
        status: r.status,
        providerMessageId: r.providerMessageId,
        error: r.error,
        skipReason: r.skipReason,
      });
    }
  } catch (err: any) {
    console.error('[/api/messaging/send] unhandled error:', err?.message);
    // Only add an error result if nothing was recorded yet so the caller sees the failure
    if (results.length === 0) {
      results.push({ channel: 'sms', status: 'failed', error: err?.message || 'Internal error' });
    }
  }

  return NextResponse.json({ success: true, results });
}
