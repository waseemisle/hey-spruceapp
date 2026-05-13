import { collection, addDoc, serverTimestamp, query, getDocs, where } from 'firebase/firestore';
import { db, auth } from './firebase';

export interface CreateNotificationParams {
  userId?: string; // Optional for single user notification
  recipientIds?: string[]; // For multiple users
  userRole?: 'admin' | 'client' | 'subcontractor';
  type:
    | 'work_order'
    | 'quote'
    | 'diagnostic_request'
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

/**
 * Creates a notification for a user or multiple users
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const { userId, recipientIds, ...rest } = params;
    const notificationsToCreate = [];

    if (userId) {
      notificationsToCreate.push({
        ...rest,
        userId,
        read: false,
        createdAt: serverTimestamp(),
      });
    }

    if (recipientIds && recipientIds.length > 0) {
      recipientIds.forEach(id => {
        notificationsToCreate.push({
          ...rest,
          userId: id,
          read: false,
          createdAt: serverTimestamp(),
        });
      });
    }

    if (notificationsToCreate.length === 0) {
      console.warn('No user ID or recipient IDs provided for notification.');
      return;
    }

    // Create all notifications
    const promises = notificationsToCreate.map(notification => 
      addDoc(collection(db, 'notifications'), notification)
    );
    await Promise.all(promises);
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

/**
 * Gets all admin user IDs
 */
export async function getAllAdminUserIds(): Promise<string[]> {
  try {
    // Try both 'adminUsers' and 'users' collections
    try {
      const adminsQuery = query(collection(db, 'adminUsers'));
      const snapshot = await getDocs(adminsQuery);
      if (!snapshot.empty) {
        return snapshot.docs.map(doc => doc.id);
      }
    } catch (e) {
      // Fall through to users collection
    }

    // Try users collection with role filter
    const usersQuery = query(
      collection(db, 'users'),
      where('role', '==', 'admin')
    );
    const snapshot = await getDocs(usersQuery);
    return snapshot.docs.map(doc => doc.id);
  } catch (error: any) {
    // Expected for non-admin users — permission denied is intentional
    if (!error?.code?.includes('permission-denied')) {
      console.error('Error fetching admin users:', error);
    }
    return [];
  }
}

const ADMIN_FANOUT_URL = '/api/notifications/admin-fanout';

/** Server-resolved admin fan-out (sub/client browsers cannot list adminUsers). */
async function tryPostAdminFanout(
  idToken: string | null | undefined,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const token =
      idToken ??
      (typeof window !== 'undefined' && auth?.currentUser
        ? await auth.currentUser.getIdToken().catch(() => null)
        : null);
    if (!token) return false;
    const res = await fetch(ADMIN_FANOUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Submitted diagnostic fee/notes on assigned flow — admins only (server fan-out).
 */
export async function notifyAdminsDiagnosticRepairPendingGate(
  workOrderId: string,
  workOrderNumber: string,
  subcontractorName: string,
  idToken?: string | null,
): Promise<void> {
  const ok = await tryPostAdminFanout(idToken, {
    type: 'diagnostic_submitted_repair_pending',
    workOrderId,
    workOrderNumber,
    subcontractorName,
  });
  if (!ok) {
    console.error('notifyAdminsDiagnosticRepairPendingGate: API failed or no token');
  }
}

/** After sub accepts assignment — schedule message to admins (server fan-out). */
export async function notifyAdminsWorkOrderScheduleSet(
  workOrderId: string,
  message: string,
  idToken?: string | null,
): Promise<void> {
  const ok = await tryPostAdminFanout(idToken, {
    type: 'work_order_scheduled_admins',
    workOrderId,
    message,
  });
  if (!ok) {
    console.error('notifyAdminsWorkOrderScheduleSet: API failed or no token');
  }
}

/**
 * Notifies all admins about a new work order
 */
export async function notifyAdminsOfWorkOrder(
  workOrderId: string,
  workOrderNumber: string,
  clientName: string,
  idToken?: string | null,
) {
  try {
    if (
      await tryPostAdminFanout(idToken, {
        type: 'work_order_pending',
        workOrderId,
        workOrderNumber,
        clientName,
      })
    ) {
      return;
    }
    const adminIds = await getAllAdminUserIds();
    if (adminIds.length > 0) {
      await createNotification({
        recipientIds: adminIds,
        userRole: 'admin',
        type: 'work_order',
        title: 'New Work Order Pending Approval',
        message: `Work Order ${workOrderNumber} from ${clientName} requires your approval`,
        link: `/admin-portal/work-orders/${workOrderId}`,
        referenceId: workOrderId,
        referenceType: 'workOrder',
      });
    }
  } catch (error) {
    console.error('Error notifying admins of work order:', error);
  }
}

/**
 * Notifies all admins about a new location pending approval
 */
export async function notifyAdminsOfLocation(
  locationId: string,
  locationName: string,
  clientName: string,
  idToken?: string | null,
) {
  try {
    if (
      await tryPostAdminFanout(idToken, {
        type: 'location_pending',
        locationId,
        locationName,
        clientName,
      })
    ) {
      return;
    }
    const adminIds = await getAllAdminUserIds();
    if (adminIds.length > 0) {
      await createNotification({
        recipientIds: adminIds,
        userRole: 'admin',
        type: 'location',
        title: 'New Location Pending Approval',
        message: `Location "${locationName}" from ${clientName} requires your approval`,
        link: `/admin-portal/locations`,
        referenceId: locationId,
        referenceType: 'location',
      });
    }
  } catch (error) {
    console.error('Error notifying admins of location:', error);
  }
}

/**
 * Notifies client about work order approval
 */
export async function notifyClientOfWorkOrderApproval(clientId: string, workOrderId: string, workOrderNumber: string) {
  try {
    await createNotification({
      userId: clientId,
      userRole: 'client',
      type: 'work_order',
      title: 'Work Order Approved',
      message: `Work Order ${workOrderNumber} has been approved`,
      link: `/client-portal/work-orders/${workOrderId}`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  } catch (error) {
    console.error('Error notifying client of work order approval:', error);
  }
}

/**
 * Notifies admins only when a subcontractor submits a quote.
 * Clients must NOT be notified here — they are notified separately
 * only after the admin adds markup and clicks "Send to Client".
 *
 * @param idToken — Firebase ID token for the signed-in subcontractor (or admin).
 *   When provided (or when `auth.currentUser` is available in the browser), fan-out
 *   runs via `/api/notifications/quote-submitted` so admin IDs can be resolved
 *   server-side (subcontractors cannot read `adminUsers` in Firestore rules).
 */
export async function notifyQuoteSubmission(
  clientId: string,
  workOrderId: string,
  workOrderNumber: string,
  subcontractorName: string,
  quoteAmount: number,
  idToken?: string | null
) {
  try {
    void clientId;
    void quoteAmount;

    const token =
      idToken ??
      (typeof window !== 'undefined' && auth?.currentUser
        ? await auth.currentUser.getIdToken().catch(() => null)
        : null);

    if (token) {
      const res = await fetch('/api/notifications/quote-submitted', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workOrderId,
          workOrderNumber,
          subcontractorName,
          quoteAmount,
        }),
      });
      if (res.ok) return;
      const errText = await res.text().catch(() => '');
      console.error('notifyQuoteSubmission: API failed', res.status, errText);
    }

    // Fallback when no token (e.g. server-side callers): direct fan-out works only if `db` has admin read access.
    const adminIds = await getAllAdminUserIds();
    if (adminIds.length > 0) {
      await createNotification({
        recipientIds: adminIds,
        userRole: 'admin',
        type: 'quote',
        title: 'Quote Submitted',
        message: `${subcontractorName} submitted a quote for WO ${workOrderNumber}`,
        link: `/admin-portal/quotes`,
        referenceId: workOrderId,
        referenceType: 'workOrder',
      });
    }
  } catch (error) {
    console.error('Error notifying quote submission:', error);
  }
}

/**
 * Notifies the client that a quote has been shared with them by the admin.
 * Call this ONLY after the admin has applied markup and clicked "Send to Client".
 */
export async function notifyClientOfQuoteSent(
  clientId: string,
  workOrderId: string,
  workOrderNumber: string,
  clientAmount: number
) {
  try {
    await createNotification({
      userId: clientId,
      userRole: 'client',
      type: 'quote',
      title: 'Quote Ready for Review',
      message: `A quote of $${clientAmount.toLocaleString()} for WO ${workOrderNumber} is ready for your review`,
      link: `/client-portal/quotes`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  } catch (error) {
    console.error('Error notifying client of quote:', error);
  }
}

/**
 * Notifies subcontractor about assignment
 */
export async function notifySubcontractorAssignment(
  subcontractorId: string,
  workOrderId: string,
  workOrderNumber: string
) {
  try {
    await createNotification({
      userId: subcontractorId,
      userRole: 'subcontractor',
      type: 'assignment',
      title: 'Work Order Assigned',
      message: `You've been assigned to Work Order ${workOrderNumber}`,
      link: `/subcontractor-portal/assigned`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  } catch (error) {
    console.error('Error notifying subcontractor of assignment:', error);
  }
}

/**
 * Notifies subcontractors about bidding opportunity
 */
export async function notifyBiddingOpportunity(
  subcontractorIds: string[],
  workOrderId: string,
  workOrderNumber: string,
  workOrderTitle: string
) {
  try {
    if (subcontractorIds.length > 0) {
      await createNotification({
        recipientIds: subcontractorIds,
        userRole: 'subcontractor',
        type: 'work_order',
        title: 'New Bidding Opportunity',
        message: `New work order "${workOrderTitle}" (WO ${workOrderNumber}) is available for bidding`,
        link: `/subcontractor-portal/bidding`,
        referenceId: workOrderId,
        referenceType: 'workOrder',
      });
    }
  } catch (error) {
    console.error('Error notifying bidding opportunity:', error);
  }
}

/**
 * Notifies client about invoice
 */
export async function notifyClientOfInvoice(
  clientId: string,
  invoiceId: string,
  invoiceNumber: string,
  workOrderNumber: string,
  amount: number
) {
  try {
    await createNotification({
      userId: clientId,
      userRole: 'client',
      type: 'invoice',
      title: 'Invoice Sent',
      message: `Invoice ${invoiceNumber} for WO ${workOrderNumber}: $${amount.toLocaleString()}`,
      link: `/client-portal/invoices`,
      referenceId: invoiceId,
      referenceType: 'invoice',
    });
  } catch (error) {
    console.error('Error notifying client of invoice:', error);
  }
}

/**
 * Notifies client and admin about work order completion
 */
export async function notifyWorkOrderCompletion(
  clientId: string,
  workOrderId: string,
  workOrderNumber: string,
  idToken?: string | null,
) {
  try {
    // Notify client
    await createNotification({
      userId: clientId,
      userRole: 'client',
      type: 'completion',
      title: 'Work Order Completed',
      message: `Work Order ${workOrderNumber} has been completed`,
      link: `/client-portal/work-orders/${workOrderId}`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });

    const wentApi = await tryPostAdminFanout(idToken, {
      type: 'work_order_completed_admins',
      workOrderId,
      workOrderNumber,
    });
    if (wentApi) return;

    const adminIds = await getAllAdminUserIds();
    if (adminIds.length > 0) {
      await createNotification({
        recipientIds: adminIds,
        userRole: 'admin',
        type: 'completion',
        title: 'Work Order Completed',
        message: `Work Order ${workOrderNumber} marked as complete`,
        link: `/admin-portal/work-orders/${workOrderId}`,
        referenceId: workOrderId,
        referenceType: 'workOrder',
      });
    }
  } catch (error) {
    console.error('Error notifying work order completion:', error);
  }
}

/**
 * Notifies client when admin rejects a work order
 */
export async function notifyClientOfWorkOrderRejection(
  clientId: string,
  workOrderId: string,
  workOrderNumber: string,
  reason?: string,
) {
  try {
    await createNotification({
      userId: clientId,
      userRole: 'client',
      type: 'work_order',
      title: 'Work Order Rejected',
      message: reason
        ? `Work Order ${workOrderNumber} was rejected. Reason: ${reason}`
        : `Work Order ${workOrderNumber} was rejected by the admin team.`,
      link: `/client-portal/work-orders/${workOrderId}`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  } catch (error) {
    console.error('Error notifying client of WO rejection:', error);
  }
}

/**
 * Notifies admins when a subcontractor rejects a bidding opportunity
 */
export async function notifyAdminsOfBiddingRejection(
  workOrderId: string,
  workOrderNumber: string,
  workOrderTitle: string,
  subcontractorName: string,
  idToken?: string | null,
) {
  try {
    if (
      await tryPostAdminFanout(idToken, {
        type: 'bidding_declined',
        workOrderId,
        workOrderNumber,
        workOrderTitle,
        subcontractorName,
      })
    ) {
      return;
    }
    const adminIds = await getAllAdminUserIds();
    if (adminIds.length === 0) return;
    await createNotification({
      recipientIds: adminIds,
      userRole: 'admin',
      type: 'work_order',
      title: 'Bidding Opportunity Declined',
      message: `${subcontractorName} declined the bidding opportunity for "${workOrderTitle}" (WO ${workOrderNumber}).`,
      link: `/admin-portal/work-orders/${workOrderId}`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  } catch (error) {
    console.error('Error notifying admins of bidding rejection:', error);
  }
}

/**
 * Notifies admins (and the sub) when the client rejects a quote.
 * Pass `quoteId` + `idToken` so fan-out runs server-side; otherwise falls back
 * to direct writes (works only when Firestore rules allow adminUsers reads).
 */
export async function notifyQuoteRejection(
  workOrderId: string,
  workOrderNumber: string,
  subcontractorId: string | null,
  subcontractorName: string,
  reason?: string,
  options?: { idToken?: string | null; quoteId?: string | null },
) {
  try {
    const quoteId = options?.quoteId;
    const idTok = options?.idToken;
    if (
      quoteId &&
      (await tryPostAdminFanout(idTok, {
        type: 'quote_rejected',
        quoteId,
        reason: reason ?? '',
      }))
    ) {
      return;
    }

    const adminIds = await getAllAdminUserIds();
    const summary = reason
      ? `Quote from ${subcontractorName} for WO ${workOrderNumber} was rejected by the client. Reason: ${reason}`
      : `Quote from ${subcontractorName} for WO ${workOrderNumber} was rejected by the client.`;
    if (adminIds.length > 0) {
      await createNotification({
        recipientIds: adminIds,
        userRole: 'admin',
        type: 'quote',
        title: 'Quote Rejected by Client',
        message: summary,
        link: `/admin-portal/work-orders/${workOrderId}`,
        referenceId: workOrderId,
        referenceType: 'workOrder',
      });
    }
    if (subcontractorId) {
      await createNotification({
        userId: subcontractorId,
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
  } catch (error) {
    console.error('Error notifying quote rejection:', error);
  }
}

/**
 * Notifies admins + client when a sub submits diagnostic results
 */
export async function notifyDiagnosticResultsSubmitted(
  workOrderId: string,
  workOrderNumber: string,
  subcontractorName: string,
  clientId: string | null,
  idToken?: string | null,
) {
  try {
    const wentApi = await tryPostAdminFanout(idToken, {
      type: 'diagnostic_results_submitted',
      workOrderId,
      workOrderNumber,
      subcontractorName,
    });
    if (!wentApi) {
      const adminIds = await getAllAdminUserIds();
      if (adminIds.length > 0) {
        await createNotification({
          recipientIds: adminIds,
          userRole: 'admin',
          type: 'diagnostic_request',
          title: 'Diagnostic Results Submitted',
          message: `${subcontractorName} submitted diagnostic results for WO ${workOrderNumber}.`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
        });
      }
    }
    if (clientId) {
      await createNotification({
        userId: clientId,
        userRole: 'client',
        type: 'diagnostic_request',
        title: 'Diagnostic Results Submitted',
        message: `${subcontractorName} submitted diagnostic results for WO ${workOrderNumber}.`,
        link: `/client-portal/work-orders/${workOrderId}`,
        referenceId: workOrderId,
        referenceType: 'workOrder',
      });
    }
  } catch (error) {
    console.error('Error notifying diagnostic results:', error);
  }
}

/**
 * Notifies admins when a sub accepts/rejects an assignment
 */
export async function notifyAdminsOfAssignmentResponse(
  workOrderId: string,
  workOrderNumber: string,
  subcontractorName: string,
  decision: 'accepted' | 'rejected',
  reason?: string,
  idToken?: string | null,
) {
  try {
    if (
      await tryPostAdminFanout(idToken, {
        type: 'assignment_response',
        workOrderId,
        workOrderNumber,
        subcontractorName,
        decision,
        reason: reason ?? '',
      })
    ) {
      return;
    }
    const adminIds = await getAllAdminUserIds();
    if (adminIds.length === 0) return;
    const accepted = decision === 'accepted';
    await createNotification({
      recipientIds: adminIds,
      userRole: 'admin',
      type: accepted ? 'assignment' : 'work_order',
      title: accepted ? 'Assignment Accepted' : 'Assignment Rejected',
      message: accepted
        ? `${subcontractorName} accepted the assignment for WO ${workOrderNumber}.`
        : reason
          ? `${subcontractorName} rejected the assignment for WO ${workOrderNumber}. Reason: ${reason}`
          : `${subcontractorName} rejected the assignment for WO ${workOrderNumber}.`,
      link: `/admin-portal/work-orders/${workOrderId}`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  } catch (error) {
    console.error('Error notifying assignment response:', error);
  }
}

/**
 * Notifies client about scheduled service date
 */
export async function notifyScheduledService(
  clientId: string,
  workOrderId: string,
  workOrderTitle: string,
  scheduledDate: string,
  scheduledTime: string
) {
  try {
    await createNotification({
      userId: clientId,
      userRole: 'client',
      type: 'schedule',
      title: 'Service Date Scheduled',
      message: `Your work order "${workOrderTitle}" has been scheduled for ${scheduledDate} at ${scheduledTime}`,
      link: `/client-portal/work-orders/${workOrderId}`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });
  } catch (error) {
    console.error('Error notifying scheduled service:', error);
  }
}
