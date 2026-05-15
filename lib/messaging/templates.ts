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
}): string {
  return appendSmsOptOutFooter(
    `Hi ${o.toName}, your Ground Ops account is now approved. Log in to your portal to get started.`,
  );
}

export function biddingOpportunityText(o: {
  toName: string;
  workOrderNumber: string;
  workOrderTitle: string;
}): string {
  return appendSmsOptOutFooter(
    `Hi ${o.toName}, you've been invited to bid on job ${o.workOrderNumber} – ${o.workOrderTitle}. Log in to your Ground Ops portal to review and respond.`,
  );
}

export function quoteApprovedText(o: {
  toName: string;
  workOrderNumber: string;
  workOrderTitle: string;
}): string {
  return appendSmsOptOutFooter(
    `Hi ${o.toName}, your quote for job ${o.workOrderNumber} – ${o.workOrderTitle} has been approved. Log in to your Ground Ops portal to proceed.`,
  );
}

export function testMessageText(o: { fromAdmin: string }): string {
  return `Ground Ops test message via SMS. Sent by ${o.fromAdmin}. Your SMS integration is working!`;
}
