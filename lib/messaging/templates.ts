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
  portalUrl: string;
}): string {
  const biz = o.businessName ? ` (${o.businessName})` : '';
  return `Hi ${o.toName}${biz}, your GroundOps subcontractor account has been approved! Log in to start bidding on jobs: ${o.portalUrl}`;
}

export function biddingOpportunityText(o: {
  toName: string;
  workOrderNumber: string;
  workOrderTitle: string;
  portalUrl: string;
}): string {
  return `Hi ${o.toName}, you have a new bidding opportunity on GroundOps! Work Order #${o.workOrderNumber}: ${o.workOrderTitle}. Log in to submit your bid: ${o.portalUrl}`;
}

export function quoteApprovedText(o: {
  toName: string;
  workOrderNumber: string;
  workOrderTitle: string;
  portalUrl: string;
}): string {
  return `Hi ${o.toName}, great news! Your quote for Work Order #${o.workOrderNumber}: ${o.workOrderTitle} has been approved. Log in to view the assignment: ${o.portalUrl}`;
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
