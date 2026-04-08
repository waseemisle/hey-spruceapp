import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from './firebase-server';

export type EmailType =
  | 'invoice'
  | 'quote'
  | 'invitation'
  | 'assignment'
  | 'bidding-opportunity'
  | 'client-approval'
  | 'subcontractor-approval'
  | 'maint-request-notification'
  | 'scheduled-service'
  | 'quote-notification'
  | 'review-request'
  | 'work-order-notification'
  | 'work-order-completed-notification'
  | 'support-ticket-notification'
  | 'support-ticket-comment'
  | 'support-ticket-status-change'
  | 'support-ticket-assigned'
  | 'auto-charge-receipt'
  | 'work-order-completion-client'
  | 'work-order-received'
  | 'quote-approval-admin-notification'
  | 'test';

export interface EmailLogEntry {
  type: EmailType;
  to: string | string[];
  subject: string;
  status: 'sent' | 'failed' | 'skipped';
  context: Record<string, any>;
  error?: string;
  sentAt: any; // Firestore serverTimestamp
}

export async function logEmail(entry: Omit<EmailLogEntry, 'sentAt'>) {
  try {
    const db = await getServerDb();
    await addDoc(collection(db, 'emailLogs'), {
      ...entry,
      sentAt: serverTimestamp(),
    });
  } catch (err) {
    // Never let logging failures affect email delivery
    console.error('Failed to log email:', err);
  }
}
