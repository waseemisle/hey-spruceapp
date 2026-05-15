/** Human-readable labels for resolveMessagingTargets skipReason codes. */
export function formatMessagingSkipReason(reason: string | undefined): string {
  if (!reason) return 'Not sent (skipped)';
  const map: Record<string, string> = {
    'global-disabled': 'Organization messaging is off',
    'channel-sms-disabled': 'SMS is off in messaging settings',
    'audience-subcontractors-disabled': 'Subcontractor audience is disabled',
    'event-bidding-opportunity-sms-disabled': '"Invited to bid" SMS is off',
    'event-subcontractor-approval-sms-disabled': 'Approval SMS is off',
    'event-quote-approved-sms-disabled': 'Quote-approved SMS is off',
    'subcontractor-disabled': 'Messaging disabled for this subcontractor',
    'subcontractor-channel-sms-disabled': 'SMS disabled for this subcontractor',
    'subcontractor-event-bidding-opportunity-sms-disabled': 'Bid invite SMS off for this subcontractor',
    'subcontractor-event-subcontractor-approval-sms-disabled': 'Approval SMS off for this subcontractor',
    'subcontractor-event-quote-approved-sms-disabled': 'Quote-approved SMS off for this subcontractor',
    'no-phone': 'No phone number on file',
    'subcontractor-not-approved': 'Subcontractor is not approved',
    'provider-not-configured': 'SMS provider not configured on server',
    'blooio-idempotent-replay':
      'Blooio reused a prior message (same idempotency key) — no new SMS was sent. Each invite wave now sends a unique shareBatchId.',
  };
  return map[reason] ?? reason.replace(/-/g, ' ');
}

export interface MessagingSendChannelResult {
  channel: 'sms';
  status: string;
  skipReason?: string;
  error?: string;
}

export interface MessagingSendApiBody {
  success?: boolean;
  error?: string;
  results?: MessagingSendChannelResult[];
}

/** Lines to show an admin when something did not send as expected. */
export function collectMessagingProblems(
  recipientLabel: string,
  res: Response,
  body: MessagingSendApiBody,
): string[] {
  const lines: string[] = [];
  if (!res.ok) {
    lines.push(`${recipientLabel}: messaging request failed (HTTP ${res.status})`);
    return lines;
  }
  if (body?.success === false && body.error) {
    lines.push(`${recipientLabel}: ${body.error}`);
    return lines;
  }
  const results = body?.results ?? [];
  for (const r of results) {
    if (r.status === 'failed') {
      lines.push(`${recipientLabel} (${r.channel}): ${r.error || 'failed'}`);
    }
    if (r.status === 'skipped') {
      lines.push(
        `${recipientLabel} (${r.channel}): ${(r.error && r.error.trim()) || formatMessagingSkipReason(r.skipReason)}`,
      );
    }
  }
  return lines;
}
