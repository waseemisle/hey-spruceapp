// In-app notification creator — mirror of web lib/notifications.ts.
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface CreateNotificationParams {
  userId?: string;
  recipientIds?: string[];
  userRole?: 'admin' | 'client' | 'subcontractor';
  type:
    | 'work_order'
    | 'quote'
    | 'invoice'
    | 'assignment'
    | 'completion'
    | 'schedule'
    | 'general'
    | 'location'
    | 'support_ticket';
  title: string;
  message: string;
  link?: string;
  referenceId?: string;
  referenceType?: 'workOrder' | 'quote' | 'invoice' | 'location' | 'supportTicket';
}

export async function createNotification(params: CreateNotificationParams) {
  const { userId, recipientIds, ...rest } = params;
  const rows: any[] = [];
  if (userId) rows.push({ ...rest, userId });
  if (recipientIds) recipientIds.forEach((id) => rows.push({ ...rest, userId: id }));
  if (rows.length === 0) return;
  await Promise.all(
    rows.map((r) =>
      addDoc(collection(db, 'notifications'), { ...r, read: false, createdAt: serverTimestamp() }),
    ),
  );
}
