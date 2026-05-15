import { collection, addDoc, serverTimestamp, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import type { MessageChannel, MessageEventType, MessageProvider, MessageRecipientRole, MessageStatus } from './types';

export interface MessageLogEntry {
  channel: MessageChannel;
  provider: MessageProvider;
  type: MessageEventType;
  to: string;
  toName?: string;
  recipientRole: MessageRecipientRole;
  recipientId?: string;
  body: string;
  status: MessageStatus;
  providerMessageId?: string;
  /** Compact Blooio/Meta response fields for delivery debugging (optional). */
  providerPayload?: Record<string, unknown>;
  context: Record<string, any>;
  error?: string;
  idempotencyKey?: string;
  sentAt: any;
}

function collectionFor(channel: MessageChannel): string {
  return 'smsLogs';
}

export async function logMessage(entry: Omit<MessageLogEntry, 'sentAt'>): Promise<void> {
  try {
    const db = await getServerDb();
    const col = collectionFor(entry.channel);
    // Filter out undefined values so Firestore doesn't throw
    const safe: Record<string, any> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (v !== undefined) safe[k] = v;
    }
    await addDoc(collection(db, col), { ...safe, sentAt: serverTimestamp() });
  } catch (err) {
    console.error('Failed to log message:', err);
  }
}

/** Dedupe re-fires within a time window using idempotency key. */
export async function findRecentMessageByIdempotencyKey(
  channel: MessageChannel,
  key: string,
  windowMs: number = 10 * 60 * 1000,
): Promise<{ status: MessageStatus; providerMessageId?: string } | null> {
  try {
    const db = await getServerDb();
    const col = collectionFor(channel);
    const cutoff = Timestamp.fromMillis(Date.now() - windowMs);
    const snap = await getDocs(
      query(
        collection(db, col),
        where('idempotencyKey', '==', key),
        where('sentAt', '>=', cutoff),
      ),
    );
    if (snap.empty) return null;
    const d = snap.docs[0].data();
    return { status: d.status as MessageStatus, providerMessageId: d.providerMessageId };
  } catch {
    return null;
  }
}
