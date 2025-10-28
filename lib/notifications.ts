import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface CreateNotificationParams {
  userId: string;
  userRole: 'admin' | 'client' | 'subcontractor';
  type: 'work_order' | 'quote' | 'invoice' | 'assignment' | 'completion' | 'schedule' | 'general';
  title: string;
  message: string;
  link?: string;
  referenceId?: string;
  referenceType?: 'workOrder' | 'quote' | 'invoice' | 'location';
}

/**
 * Creates a notification for a user
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    await addDoc(collection(db, 'notifications'), {
      ...params,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

/**
 * Creates notifications for multiple users
 */
export async function createNotifications(params: CreateNotificationParams[]) {
  try {
    const promises = params.map(param => createNotification(param));
    await Promise.all(promises);
  } catch (error) {
    console.error('Error creating multiple notifications:', error);
  }
}
