import type { MessageChannel, MessageEventType } from './types';
import type { WaTemplateParam } from './meta-whatsapp';

/** TCPA-style opt-out line for US A2P / short-code SMS; improves carrier acceptance. */
export function appendSmsOptOutFooter(body: string): string {
  const t = body.trim();
  if (!t) return body;
  if (/reply\s+stop/i.test(t)) return body;
  return `${t}\n\nReply STOP to opt out.`;
}

export function subcontractorApprovalText(o: {
  toName: string;
  businessName?: string;
  portalUrl?: string;
}): string {
  const biz = o.businessName ? ` (${o.businessName})` : '';
  const link = o.portalUrl ? ` ${o.portalUrl}` : '';
  return `GroundOps account notification via SMS. Sent by GroundOps. ${o.toName}${biz} account is now approved.${link}`;
}

export function biddingOpportunityText(o: {
  toName: string;
  workOrderNumber: string;
  workOrderTitle: string;
  portalUrl?: string;
}): string {
  const link = o.portalUrl ? ` ${o.portalUrl}` : '';
  return `GroundOps job notification via SMS. Sent by GroundOps. Job ${o.workOrderNumber} is assigned to ${o.toName}.${link}`;
}

export function quoteApprovedText(o: {
  toName: string;
  workOrderNumber: string;
  workOrderTitle: string;
  portalUrl?: string;
}): string {
  const link = o.portalUrl ? ` ${o.portalUrl}` : '';
  return `GroundOps job notification via SMS. Sent by GroundOps. Job ${o.workOrderNumber} quote confirmed for ${o.toName}.${link}`;
}

export function testMessageText(o: { fromAdmin: string; channel: MessageChannel }): string {
  return `GroundOps test message via ${o.channel.toUpperCase()}. Sent by ${o.fromAdmin}. Your messaging integration is working!`;
}

interface TemplateMapping {
  name: string;
  languageCode: string;
  buildBodyParams: (ctx: Record<string, any>) => WaTemplateParam[];
}

export function mapEventToTemplate(type: MessageEventType): TemplateMapping | null {
  switch (type) {
    case 'subcontractor-approval':
      return {
        name: 'subcontractor_approval_v1',
        languageCode: 'en',
        buildBodyParams: (ctx) => [
          { type: 'text', text: ctx.toName || '' },
          { type: 'text', text: ctx.portalUrl || '' },
        ],
      };
    case 'bidding-opportunity':
      return {
        name: 'bidding_opportunity_v1',
        languageCode: 'en',
        buildBodyParams: (ctx) => [
          { type: 'text', text: ctx.toName || '' },
          { type: 'text', text: ctx.workOrderNumber || '' },
          { type: 'text', text: ctx.workOrderTitle || '' },
          { type: 'text', text: ctx.portalUrl || '' },
        ],
      };
    case 'quote-approved':
      return {
        name: 'quote_approved_v1',
        languageCode: 'en',
        buildBodyParams: (ctx) => [
          { type: 'text', text: ctx.toName || '' },
          { type: 'text', text: ctx.workOrderNumber || '' },
          { type: 'text', text: ctx.workOrderTitle || '' },
          { type: 'text', text: ctx.portalUrl || '' },
        ],
      };
    case 'test':
      // No approved template for test — fall back to plain text
      return null;
    default:
      return null;
  }
}
