export type MessageChannel = 'sms' | 'whatsapp';

export type MessageEventType =
  | 'subcontractor-approval'
  | 'bidding-opportunity'
  | 'quote-approved'
  | 'client-approval'
  | 'work-order-assigned'
  | 'work-order-completed'
  | 'test';

export type MessageRecipientRole = 'subcontractor' | 'client' | 'admin' | 'unknown';

export type MessageStatus = 'sent' | 'delivered' | 'queued' | 'failed' | 'skipped';

export type MessageProvider = 'blooio' | 'meta-whatsapp';

export interface SendChannelResult {
  success: boolean;
  status: MessageStatus;
  providerMessageId?: string;
  error?: string;
  /** When Blooio returns HTTP 200 for a duplicate Idempotency-Key (no new SMS). */
  skipReason?: string;
  raw?: any;
}
