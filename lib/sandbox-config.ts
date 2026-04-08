// All Firestore collections to copy from production → staging
export const SYNC_COLLECTIONS = [
  'adminUsers',
  'assignedJobs',
  'biddingWorkOrders',
  'categories',
  'chats',
  'clientCharges',
  'clients',
  'companies',
  'consolidatedInvoices',
  'emailLogs',
  'invoices',
  'locationMappings',
  'locations',
  'maint_requests',
  'messages',
  'notifications',
  'quotes',
  'recurringWorkOrderExecutions',
  'recurringWorkOrders',
  'scheduled_invoices',
  'subcontractors',
  'supportTickets',
  'users',
  'workOrderNotes',
  'workOrders',
];

// Known subcollections — parent collection → list of subcollection names
export const SUBCOLLECTIONS: Record<string, string[]> = {
  supportTickets: ['comments'],
};
