import { collection, addDoc, serverTimestamp, query, getDocs, where } from 'firebase/firestore';
import { db } from './firebase';

export interface CreateNotificationParams {
  userId?: string; // Optional for single user notification
  recipientIds?: string[]; // For multiple users
  userRole?: 'admin' | 'client' | 'subcontractor';
  type: 'work_order' | 'quote' | 'invoice' | 'assignment' | 'completion' | 'schedule' | 'general' | 'location';
  title: string;
  message: string;
  link?: string;
  referenceId?: string;
  referenceType?: 'workOrder' | 'quote' | 'invoice' | 'location';
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
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return [];
  }
}

/**
 * Notifies all admins about a new work order
 */
export async function notifyAdminsOfWorkOrder(workOrderId: string, workOrderNumber: string, clientName: string) {
  try {
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
export async function notifyAdminsOfLocation(locationId: string, locationName: string, clientName: string) {
  try {
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
 * Notifies client and admin about quote submission
 */
export async function notifyQuoteSubmission(
  clientId: string,
  workOrderId: string,
  workOrderNumber: string,
  subcontractorName: string,
  quoteAmount: number
) {
  try {
    // Notify client
    await createNotification({
      userId: clientId,
      userRole: 'client',
      type: 'quote',
      title: 'New Quote Received',
      message: `New quote of $${quoteAmount.toLocaleString()} from ${subcontractorName} for WO ${workOrderNumber}`,
      link: `/client-portal/quotes`,
      referenceId: workOrderId,
      referenceType: 'workOrder',
    });

    // Notify all admins
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
  workOrderNumber: string
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

    // Notify all admins
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
