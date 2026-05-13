/**
 * In-app notification writes using an authenticated server Firestore instance
 * (`getServerDb()`). Do not use `lib/firebase` `db` from API routes — it is not
 * the sync admin session and adminUsers reads will fail.
 */

import {
  type Firestore,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

export async function fetchAllAdminUserIds(db: Firestore): Promise<string[]> {
  try {
    const adminsSnap = await getDocs(collection(db, 'adminUsers'));
    if (!adminsSnap.empty) return adminsSnap.docs.map((d) => d.id);
  } catch {
    /* fall through */
  }
  try {
    const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
    return usersSnap.docs.map((d) => d.id);
  } catch {
    return [];
  }
}

export type InAppUserRole = 'admin' | 'client' | 'subcontractor';

export type InAppNotificationPayload = {
  userId: string;
  userRole: InAppUserRole;
  type: string;
  title: string;
  message: string;
  link?: string;
  referenceId?: string;
  /** Firestore allows arbitrary strings; keep aligned with app usage (e.g. supportTicket, maintRequest). */
  referenceType?: string;
};

export async function writeInAppNotification(db: Firestore, p: InAppNotificationPayload): Promise<void> {
  await addDoc(collection(db, 'notifications'), {
    ...p,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function fanOutToAllAdmins(
  db: Firestore,
  payload: Omit<InAppNotificationPayload, 'userId' | 'userRole'>,
): Promise<number> {
  const ids = await fetchAllAdminUserIds(db);
  await Promise.all(
    ids.map((userId) =>
      writeInAppNotification(db, {
        ...payload,
        userId,
        userRole: 'admin',
      }),
    ),
  );
  return ids.length;
}

/** Used by `/api/quotes/reject` and any server path that mirrors client quote rejection. */
export async function notifyQuoteRejectionWithServerDb(
  db: Firestore,
  quoteData: Record<string, unknown>,
  reason?: string,
): Promise<void> {
  const workOrderId = String(quoteData.workOrderId || '');
  const workOrderNumber = String(quoteData.workOrderNumber || quoteData.workOrderId || '');
  const subcontractorName = String(quoteData.subcontractorName || 'Subcontractor');
  const summary = reason
    ? `Quote from ${subcontractorName} for WO ${workOrderNumber} was rejected by the client. Reason: ${reason}`
    : `Quote from ${subcontractorName} for WO ${workOrderNumber} was rejected by the client.`;

  await fanOutToAllAdmins(db, {
    type: 'quote',
    title: 'Quote Rejected by Client',
    message: summary,
    link: `/admin-portal/work-orders/${workOrderId}`,
    referenceId: workOrderId,
    referenceType: 'workOrder',
  });

  const sid = quoteData.subcontractorId;
  if (sid) {
    await writeInAppNotification(db, {
      userId: String(sid),
      userRole: 'subcontractor',
      type: 'quote',
      title: 'Quote Rejected by Client',
      message: reason
        ? `Your quote for WO ${workOrderNumber} was rejected by the client. Reason: ${reason}`
        : `Your quote for WO ${workOrderNumber} was rejected by the client.`,
      link: `/subcontractor-portal/quotes`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  }
}

/** Client-facing invoice bell — use from API routes with `getServerDb()`, not `lib/notifications`. */
export async function notifyClientOfInvoiceWithServerDb(
  db: Firestore,
  params: {
    clientId: string;
    invoiceId: string;
    invoiceNumber: string;
    workOrderNumber: string;
    amount: number;
  },
): Promise<void> {
  const { clientId, invoiceId, invoiceNumber, workOrderNumber, amount } = params;
  await writeInAppNotification(db, {
    userId: clientId,
    userRole: 'client',
    type: 'invoice',
    title: 'Invoice Sent',
    message: `Invoice ${invoiceNumber} for WO ${workOrderNumber}: $${amount.toLocaleString()}`,
    link: `/client-portal/invoices`,
    referenceId: invoiceId,
    referenceType: 'invoice',
  });
}
