import { collection, query, where, getDocs, DocumentData, Firestore, documentId } from 'firebase/firestore';
import { db as defaultDb } from './firebase';

// Work Orders Data Calculation
export async function calculateWorkOrdersData(
  portalType: 'admin' | 'client' | 'subcontractor',
  userId?: string,
  assignedLocations?: string[],
  db?: Firestore,
  companyId?: string,
  /** When portalType is client: fetch same-company work orders at assigned locations (coworker visibility). */
  clientPeerCompanyId?: string
) {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return getEmptyWorkOrdersData();
  try {
    let workOrdersQuery;

    // Build query based on portal type
    if (portalType === 'admin') {
      // Admin sees all work orders
      workOrdersQuery = query(collection(dbInstance, 'workOrders'));
    } else if (portalType === 'client') {
      // Client sees work orders for their assigned locations AND by clientId (so none are missed)
      if (assignedLocations && assignedLocations.length > 0 && userId) {
        const batchSize = 10;
        const byId = new Map<string, DocumentData>();

        // Location-based queries may fail if Firestore rules can't verify all results
        // are accessible to the client — skip silently and rely on clientId query below
        try {
          for (let i = 0; i < assignedLocations.length; i += batchSize) {
            const batch = assignedLocations.slice(i, i + batchSize);
            workOrdersQuery = query(
              collection(dbInstance, 'workOrders'),
              where('locationId', 'in', batch)
            );
            const snapshot = await getDocs(workOrdersQuery);
            snapshot.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
          }
        } catch {
          // Permission denied for location-based query; clientId query below covers own work orders
        }

        // Also fetch by clientId so work orders linked to client but not in assignedLocations are included
        workOrdersQuery = query(
          collection(dbInstance, 'workOrders'),
          where('clientId', '==', userId)
        );
        const clientIdSnapshot = await getDocs(workOrdersQuery);
        clientIdSnapshot.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));

        if (clientPeerCompanyId) {
          try {
            const peerQuery = query(
              collection(dbInstance, 'workOrders'),
              where('companyId', '==', clientPeerCompanyId)
            );
            const peerSnap = await getDocs(peerQuery);
            const assignedSet = new Set(assignedLocations);
            peerSnap.docs.forEach(d => {
              const data = d.data();
              if (data.locationId && assignedSet.has(data.locationId)) {
                byId.set(d.id, { id: d.id, ...data });
              }
            });
          } catch {
            // Permission denied or query unsupported — location + clientId paths still apply
          }
        }

        const allWorkOrders = Array.from(byId.values());
        return processWorkOrdersData(allWorkOrders);
      } else {
        // Fallback to clientId
        workOrdersQuery = query(
          collection(dbInstance, 'workOrders'),
          where('clientId', '==', userId)
        );
      }
    } else {
      // Subcontractor sees assigned work orders and bidding opportunities
      // Combine data from assignedJobs and biddingWorkOrders
      const assignedQuery = query(
        collection(dbInstance, 'assignedJobs'),
        where('subcontractorId', '==', userId)
      );
      const assignedSnapshot = await getDocs(assignedQuery);
      const workOrderIds = assignedSnapshot.docs.map(doc => doc.data().workOrderId);

      if (workOrderIds.length > 0) {
        // Get work orders in batches
        const batchSize = 10;
        let allWorkOrders: DocumentData[] = [];

        for (let i = 0; i < workOrderIds.length; i += batchSize) {
          const batch = workOrderIds.slice(i, i + batchSize);
          workOrdersQuery = query(
            collection(dbInstance, 'workOrders'),
            where(documentId(), 'in', batch)
          );
          const snapshot = await getDocs(workOrdersQuery);
          allWorkOrders = [...allWorkOrders, ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
        }

        return processWorkOrdersData(allWorkOrders);
      }
    }

    // Fetch work orders
    const workOrdersSnapshot = portalType !== 'subcontractor' || !userId
      ? await getDocs(workOrdersQuery!)
      : { docs: [] };
    let workOrders = workOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Apply company filter for admin
    if (portalType === 'admin' && companyId) {
      workOrders = workOrders.filter(wo => (wo as any).companyId === companyId);
    }

    return processWorkOrdersData(workOrders);
  } catch (error) {
    console.error('Error calculating work orders data:', error);
    return getEmptyWorkOrdersData();
  }
}

function processWorkOrdersData(workOrders: DocumentData[]) {
  const data = {
    workRequired: {
      total: 0,
      dispatchNotConfirmed: { urgent: 0, total: 0 },
      declinedByProvider: { urgent: 0, total: 0 },
      lateToArrive: { urgent: 0, total: 0 },
    },
    inProgress: {
      total: 0,
      partsOnOrder: { urgent: 0, total: 0 },
      waitingForQuote: { urgent: 0, total: 0 },
      unsatisfactory: 0,
    },
    awaitingAction: {
      total: 0,
      pendingConfirmation: 0,
      actionRequired: 0,
      myActionRequired: 0,
    },
  };

  const now = new Date();

  workOrders.forEach((wo) => {
    const status = wo.status;
    const scheduledDate = wo.scheduledServiceDate?.toDate?.() || (wo.scheduledServiceDate ? new Date(wo.scheduledServiceDate) : null);

    // Work Required Category
    if (status === 'approved' && !wo.assignedTo) {
      // Dispatch Not Confirmed
      data.workRequired.dispatchNotConfirmed.total++;
      if (wo.priority === 'high') data.workRequired.dispatchNotConfirmed.urgent++;
      data.workRequired.total++;
    } else if (status === 'declined_by_provider') {
      // Declined By Provider
      data.workRequired.declinedByProvider.total++;
      if (wo.priority === 'high') data.workRequired.declinedByProvider.urgent++;
      data.workRequired.total++;
    } else if (scheduledDate && scheduledDate < now && status !== 'completed' && status !== 'in-progress') {
      // Late to Arrive
      data.workRequired.lateToArrive.total++;
      if (wo.priority === 'high') data.workRequired.lateToArrive.urgent++;
      data.workRequired.total++;
    }

    // In Progress Category
    if (status === 'parts_on_order' || (status === 'assigned' && wo.partsRequired)) {
      data.inProgress.partsOnOrder.total++;
      if (wo.priority === 'high') data.inProgress.partsOnOrder.urgent++;
      data.inProgress.total++;
    } else if (status === 'quote_received' || status === 'quotes_received') {
      data.inProgress.waitingForQuote.total++;
      if (wo.priority === 'high') data.inProgress.waitingForQuote.urgent++;
      data.inProgress.total++;
    } else if (status === 'unsatisfactory') {
      data.inProgress.unsatisfactory++;
      data.inProgress.total++;
    } else if (status === 'in-progress') {
      data.inProgress.total++;
    }

    // Awaiting Action Category
    if (status === 'pending') {
      data.awaitingAction.pendingConfirmation++;
      data.awaitingAction.total++;
    } else if (wo.actionRequired) {
      data.awaitingAction.actionRequired++;
      data.awaitingAction.total++;
    } else if (wo.myActionRequired) {
      data.awaitingAction.myActionRequired++;
      data.awaitingAction.total++;
    }
  });

  return data;
}

function getEmptyWorkOrdersData() {
  return {
    workRequired: {
      total: 0,
      dispatchNotConfirmed: { urgent: 0, total: 0 },
      declinedByProvider: { urgent: 0, total: 0 },
      lateToArrive: { urgent: 0, total: 0 },
    },
    inProgress: {
      total: 0,
      partsOnOrder: { urgent: 0, total: 0 },
      waitingForQuote: { urgent: 0, total: 0 },
      unsatisfactory: 0,
    },
    awaitingAction: {
      total: 0,
      pendingConfirmation: 0,
      actionRequired: 0,
      myActionRequired: 0,
    },
  };
}

// Proposals (Quotes) Data Calculation
export async function calculateProposalsData(
  portalType: 'admin' | 'client' | 'subcontractor',
  userId?: string,
  db?: Firestore,
  companyId?: string
) {
  const dbInstance = db || defaultDb;
  if (!dbInstance) {
    return {
      pendingApproval: { urgent: 0, total: 0 },
      onHold: 0,
      rejected: 0,
      approved: 0,
    };
  }
  try {
    let quotesQuery;

    // Build query based on portal type
    if (portalType === 'admin') {
      quotesQuery = query(collection(dbInstance, 'quotes'));
    } else if (portalType === 'client') {
      quotesQuery = query(
        collection(dbInstance, 'quotes'),
        where('clientId', '==', userId)
      );
    } else {
      quotesQuery = query(
        collection(dbInstance, 'quotes'),
        where('subcontractorId', '==', userId)
      );
    }

    const quotesSnapshot = await getDocs(quotesQuery);
    let quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Apply company filter for admin
    if (portalType === 'admin' && companyId) {
      const woSnapshot = await getDocs(
        query(collection(dbInstance, 'workOrders'), where('companyId', '==', companyId))
      );
      const workOrderIds = new Set(woSnapshot.docs.map(d => d.id));
      quotes = quotes.filter(q => (q as any).workOrderId && workOrderIds.has((q as any).workOrderId));
    }

    return processProposalsData(quotes, portalType);
  } catch (error) {
    console.error('Error calculating proposals data:', error);
    return {
      pendingApproval: { urgent: 0, total: 0 },
      onHold: 0,
      rejected: 0,
      approved: 0,
    };
  }
}

function processProposalsData(quotes: DocumentData[], portalType: string) {
  const data = {
    pendingApproval: { urgent: 0, total: 0 },
    onHold: 0,
    rejected: 0,
    approved: 0,
  };

  quotes.forEach((quote) => {
    const status = quote.status;

    // Pending Approval - different interpretation per portal
    if (portalType === 'admin' && status === 'pending') {
      data.pendingApproval.total++;
    } else if (portalType === 'client' && status === 'sent_to_client') {
      data.pendingApproval.total++;
    } else if (portalType === 'subcontractor' && status === 'pending') {
      data.pendingApproval.total++;
    }

    // On Hold
    if (status === 'on_hold' || quote.onHold) {
      data.onHold++;
    }

    // Rejected
    if (status === 'rejected') {
      data.rejected++;
    }

    // Approved
    if (status === 'accepted') {
      data.approved++;
    }
  });

  return data;
}

// Invoices Data Calculation
export async function calculateInvoicesData(
  portalType: 'admin' | 'client' | 'subcontractor',
  userId?: string,
  db?: Firestore,
  companyId?: string
) {
  const dbInstance = db || defaultDb;
  if (!dbInstance) {
    return {
      completedNotInvoiced: 0,
      openReviewed: { count: 0, amount: '0.00', mixedCurrency: false },
      onHold: { count: 0, amount: '0.00' },
      rejected: { count: 0, amount: '0.00' },
    };
  }
  try {
    let invoicesQuery;
    let workOrdersQuery;

    // Build queries based on portal type
    if (portalType === 'admin') {
      invoicesQuery = query(collection(dbInstance, 'invoices'));
      workOrdersQuery = query(collection(dbInstance, 'workOrders'), where('status', '==', 'completed'));

      const [invoicesSnapshot, workOrdersSnapshot] = await Promise.all([
        getDocs(invoicesQuery),
        getDocs(workOrdersQuery),
      ]);
      let invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let completedWorkOrders = workOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Apply company filter for admin
      if (companyId) {
        const allWoSnapshot = await getDocs(
          query(collection(dbInstance, 'workOrders'), where('companyId', '==', companyId))
        );
        const allWorkOrderIds = new Set(allWoSnapshot.docs.map(d => d.id));
        completedWorkOrders = completedWorkOrders.filter(wo => allWorkOrderIds.has(wo.id));
        invoices = invoices.filter(inv =>
          (inv as any).workOrderId ? allWorkOrderIds.has((inv as any).workOrderId) : false
        );
      }

      return processInvoicesData(invoices, completedWorkOrders);
    } else if (portalType === 'client') {
      invoicesQuery = query(
        collection(dbInstance, 'invoices'),
        where('clientId', '==', userId)
      );
      workOrdersQuery = query(
        collection(dbInstance, 'workOrders'),
        where('clientId', '==', userId),
        where('status', '==', 'completed')
      );

      const invoicesSnapshot = await getDocs(invoicesQuery);
      const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const workOrdersSnapshot = await getDocs(workOrdersQuery);
      const completedWorkOrders = workOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return processInvoicesData(invoices, completedWorkOrders);
    } else {
      // Subcontractor
      invoicesQuery = query(
        collection(dbInstance, 'invoices'),
        where('subcontractorId', '==', userId)
      );

      // For subcontractors, get completed work orders they were assigned to
      const assignedQuery = query(
        collection(dbInstance, 'assignedJobs'),
        where('subcontractorId', '==', userId)
      );
      const assignedSnapshot = await getDocs(assignedQuery);
      const workOrderIds = assignedSnapshot.docs.map(doc => doc.data().workOrderId);

      // Get completed work orders
      if (workOrderIds.length > 0) {
        const batchSize = 10;
        let completedWorkOrders: DocumentData[] = [];

        for (let i = 0; i < workOrderIds.length; i += batchSize) {
          const batch = workOrderIds.slice(i, i + batchSize);
          const woQuery = query(
            collection(dbInstance, 'workOrders'),
            where(documentId(), 'in', batch),
            where('status', '==', 'completed')
          );
          const snapshot = await getDocs(woQuery);
          completedWorkOrders = [...completedWorkOrders, ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
        }

        const invoicesSnapshot = await getDocs(invoicesQuery);
        return processInvoicesData(
          invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          completedWorkOrders
        );
      } else {
        // No assigned jobs, return empty data
        const invoicesSnapshot = await getDocs(invoicesQuery);
        return processInvoicesData(
          invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          []
        );
      }
    }
  } catch (error) {
    console.error('Error calculating invoices data:', error);
    return {
      completedNotInvoiced: 0,
      openReviewed: { count: 0, amount: '0.00', mixedCurrency: false },
      onHold: { count: 0, amount: '0.00' },
      rejected: { count: 0, amount: '0.00' },
    };
  }
}

function processInvoicesData(invoices: DocumentData[], completedWorkOrders: DocumentData[]) {
  const data = {
    completedNotInvoiced: 0,
    openReviewed: { count: 0, amount: '0.00', mixedCurrency: false },
    onHold: { count: 0, amount: '0.00' },
    rejected: { count: 0, amount: '0.00' },
  };

  // Completed Not Invoiced - count completed work orders without invoices
  const invoicedWorkOrderIds = invoices.map(inv => inv.workOrderId);
  data.completedNotInvoiced = completedWorkOrders.filter(
    wo => !invoicedWorkOrderIds.includes(wo.id)
  ).length;

  // Process invoices
  let openReviewedTotal = 0;
  let onHoldTotal = 0;
  let rejectedTotal = 0;

  invoices.forEach((invoice) => {
    const status = invoice.status;
    const amount = invoice.totalAmount || 0;

    if (status === 'sent') {
      data.openReviewed.count++;
      openReviewedTotal += amount;
    } else if (status === 'draft' || invoice.onHold) {
      data.onHold.count++;
      onHoldTotal += amount;
    } else if (status === 'rejected' || invoice.rejected) {
      data.rejected.count++;
      rejectedTotal += amount;
    }
  });

  data.openReviewed.amount = openReviewedTotal.toFixed(2);
  data.onHold.amount = onHoldTotal.toFixed(2);
  data.rejected.amount = rejectedTotal.toFixed(2);

  // Check for mixed currency (simplified - just check if count > 5 for demo)
  data.openReviewed.mixedCurrency = data.openReviewed.count > 5;

  return data;
}

// Bidding Work Orders Data Calculation
export async function calculateBiddingWorkOrdersData(userId: string, db?: Firestore) {
  const dbInstance = db || defaultDb;
  if (!dbInstance) {
    return { pending: 0, quoteSubmitted: 0, total: 0 };
  }
  try {
    const biddingQuery = query(
      collection(dbInstance, 'biddingWorkOrders'),
      where('subcontractorId', '==', userId)
    );

    const biddingSnapshot = await getDocs(biddingQuery);
    const biddingWorkOrders = biddingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return processBiddingWorkOrdersData(biddingWorkOrders);
  } catch (error) {
    console.error('Error calculating bidding work orders data:', error);
    return {
      pending: 0,
      quoteSubmitted: 0,
      total: 0,
    };
  }
}

function processBiddingWorkOrdersData(biddingWorkOrders: DocumentData[]) {
  const data = {
    pending: 0,
    quoteSubmitted: 0,
    total: 0,
  };

  biddingWorkOrders.forEach((bidding) => {
    data.total++;
    if (bidding.status === 'pending') {
      data.pending++;
    } else if (bidding.status === 'quoted' || bidding.status === 'quote_submitted') {
      data.quoteSubmitted++;
    }
  });

  return data;
}

// My Quotes Data Calculation
export async function calculateMyQuotesData(userId: string, db?: Firestore) {
  const dbInstance = db || defaultDb;
  if (!dbInstance) {
    return { pending: 0, underReview: 0, accepted: 0, rejected: 0, total: 0 };
  }
  try {
    const quotesQuery = query(
      collection(dbInstance, 'quotes'),
      where('subcontractorId', '==', userId)
    );

    const quotesSnapshot = await getDocs(quotesQuery);
    const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return processMyQuotesData(quotes);
  } catch (error) {
    console.error('Error calculating my quotes data:', error);
    return {
      pending: 0,
      underReview: 0,
      accepted: 0,
      rejected: 0,
      total: 0,
    };
  }
}

function processMyQuotesData(quotes: DocumentData[]) {
  const data = {
    pending: 0,
    underReview: 0,
    accepted: 0,
    rejected: 0,
    total: 0,
  };

  quotes.forEach((quote) => {
    data.total++;
    const status = quote.status;

    if (status === 'accepted') {
      data.accepted++;
    } else if (status === 'rejected') {
      data.rejected++;
    } else if (status === 'sent_to_client' || quote.forwardedToClient) {
      data.underReview++;
    } else if (status === 'pending') {
      data.pending++;
    }
  });

  return data;
}

// Assigned Jobs Data Calculation
export async function calculateAssignedJobsData(userId: string, db?: Firestore) {
  const dbInstance = db || defaultDb;
  if (!dbInstance) {
    return { pendingAcceptance: 0, accepted: 0, inProgress: 0, completed: 0, total: 0 };
  }
  try {
    const assignedQuery = query(
      collection(dbInstance, 'assignedJobs'),
      where('subcontractorId', '==', userId)
    );

    const assignedSnapshot = await getDocs(assignedQuery);
    const assignedJobs = assignedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Array<{ id: string; workOrderId?: string; [key: string]: any }>;

    // Get work order IDs to check their status
    const workOrderIds = assignedJobs.map(job => job.workOrderId).filter((id): id is string => !!id);
    
    let workOrders: DocumentData[] = [];
    if (workOrderIds.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < workOrderIds.length; i += batchSize) {
        const batch = workOrderIds.slice(i, i + batchSize);
        const woQuery = query(
          collection(dbInstance, 'workOrders'),
          where(documentId(), 'in', batch)
        );
        const snapshot = await getDocs(woQuery);
        workOrders = [...workOrders, ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
      }
    }

    return processAssignedJobsData(assignedJobs, workOrders);
  } catch (error) {
    console.error('Error calculating assigned jobs data:', error);
    return {
      pendingAcceptance: 0,
      accepted: 0,
      inProgress: 0,
      completed: 0,
      total: 0,
    };
  }
}

function processAssignedJobsData(assignedJobs: DocumentData[], workOrders: DocumentData[]) {
  const data = {
    pendingAcceptance: 0,
    accepted: 0,
    inProgress: 0,
    completed: 0,
    total: 0,
  };

  const workOrdersMap = new Map(workOrders.map(wo => [wo.id, wo]));

  assignedJobs.forEach((job) => {
    data.total++;
    const jobStatus = job.status;
    const workOrder = workOrdersMap.get(job.workOrderId);
    const woStatus = workOrder?.status;

    if (jobStatus === 'pending_acceptance') {
      data.pendingAcceptance++;
    } else if (jobStatus === 'accepted') {
      if (woStatus === 'completed' || woStatus === 'pending_invoice') {
        data.completed++;
      } else if (woStatus === 'in-progress') {
        data.inProgress++;
      } else {
        data.accepted++;
      }
    }
  });

  return data;
}

// ───────────────────────────────────────────────────────────────────────────
// Completed Jobs (subcontractor) — companion to calculateAssignedJobsData.
// Returns counts split between work orders the sub completed and ones that
// are completed-but-not-invoiced (pending_invoice).
// ───────────────────────────────────────────────────────────────────────────
export async function calculateCompletedJobsData(userId: string, db?: Firestore) {
  const dbInstance = db || defaultDb;
  const empty = { total: 0, pendingInvoice: 0, completed: 0 };
  if (!dbInstance) return empty;
  try {
    // assignedTo is the modern field; assignedSubcontractor is legacy. Query both.
    const [primary, legacy] = await Promise.all([
      getDocs(query(collection(dbInstance, 'workOrders'), where('assignedTo', '==', userId))),
      getDocs(query(collection(dbInstance, 'workOrders'), where('assignedSubcontractor', '==', userId))),
    ]);
    const map = new Map<string, DocumentData>();
    [...primary.docs, ...legacy.docs].forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
    let pendingInvoice = 0;
    let completed = 0;
    for (const wo of map.values()) {
      if (wo.status === 'pending_invoice') pendingInvoice += 1;
      else if (wo.status === 'completed') completed += 1;
    }
    return { total: pendingInvoice + completed, pendingInvoice, completed };
  } catch (error) {
    console.error('Error calculating completed jobs data:', error);
    return empty;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Recent items — small lists rendered inline on the dashboard so the user
// can drill into specific records without leaving the dashboard.
// All return { items: [...], ... } where items have shape compatible with
// DashboardRecentList. Sort by createdAt desc; cap at `limit`.
// ───────────────────────────────────────────────────────────────────────────

const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
};

const fmtMoney = (n: number | undefined | null): string =>
  typeof n === 'number' && Number.isFinite(n) ? `$${n.toFixed(2)}` : '';

export interface RecentItemRow {
  id: string;
  title: string;
  subtitle?: string;
  amount?: string;
  statusLabel?: string;
  statusTone?: 'green' | 'red' | 'amber' | 'blue' | 'gray';
  href: string;
  actionLabel?: string;
}

export async function fetchRecentBiddingWorkOrders(
  userId: string,
  db?: Firestore,
  limit = 5,
): Promise<RecentItemRow[]> {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return [];
  try {
    const snap = await getDocs(query(
      collection(dbInstance, 'biddingWorkOrders'),
      where('subcontractorId', '==', userId),
      where('status', '==', 'pending'),
    ));
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => toMs(b.sharedAt || b.createdAt) - toMs(a.sharedAt || a.createdAt))
      .slice(0, limit)
      .map((b): RecentItemRow => ({
        id: b.id,
        title: b.workOrderTitle || b.workOrderNumber || 'Untitled bidding request',
        subtitle: [b.locationName, b.category, b.priority]
          .filter(Boolean)
          .join(' • ') || undefined,
        statusLabel: 'Submit Quote',
        statusTone: 'amber',
        href: '/subcontractor-portal/bidding',
        actionLabel: 'Review',
      }));
    return rows;
  } catch (error) {
    console.error('fetchRecentBiddingWorkOrders error:', error);
    return [];
  }
}

export async function fetchRecentMyQuotes(
  userId: string,
  db?: Firestore,
  limit = 5,
): Promise<RecentItemRow[]> {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return [];
  try {
    const snap = await getDocs(query(
      collection(dbInstance, 'quotes'),
      where('subcontractorId', '==', userId),
    ));
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      .slice(0, limit)
      .map((q): RecentItemRow => {
        const status = String(q.status || '');
        let label: string = status.replace(/_/g, ' ');
        let tone: RecentItemRow['statusTone'] = 'gray';
        if (status === 'accepted') { label = 'Accepted'; tone = 'green'; }
        else if (status === 'rejected') { label = 'Rejected'; tone = 'red'; }
        else if (status === 'sent_to_client' || q.forwardedToClient) { label = 'Under Review'; tone = 'blue'; }
        else if (status === 'pending') { label = 'Pending'; tone = 'amber'; }
        return {
          id: q.id,
          title: q.workOrderTitle || q.workOrderNumber || 'Quote',
          subtitle: [q.clientName, q.locationName].filter(Boolean).join(' • ') || undefined,
          amount: fmtMoney(typeof q.totalAmount === 'number' ? q.totalAmount : q.amount),
          statusLabel: label,
          statusTone: tone,
          href: '/subcontractor-portal/quotes',
        };
      });
    return rows;
  } catch (error) {
    console.error('fetchRecentMyQuotes error:', error);
    return [];
  }
}

export async function fetchRecentAssignedJobs(
  userId: string,
  db?: Firestore,
  limit = 5,
): Promise<RecentItemRow[]> {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return [];
  try {
    const snap = await getDocs(query(
      collection(dbInstance, 'assignedJobs'),
      where('subcontractorId', '==', userId),
    ));
    const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    // Pull related work orders to surface real status (in_progress vs pending_invoice etc.)
    const woIds = [...new Set(jobs.map(j => j.workOrderId).filter(Boolean))] as string[];
    const woMap = new Map<string, DocumentData>();
    for (let i = 0; i < woIds.length; i += 10) {
      const batch = woIds.slice(i, i + 10);
      const woSnap = await getDocs(query(
        collection(dbInstance, 'workOrders'),
        where(documentId(), 'in', batch),
      ));
      woSnap.docs.forEach(d => woMap.set(d.id, { id: d.id, ...d.data() }));
    }
    const ACTIVE = (job: any, wo: any) => {
      if (job.status === 'pending_acceptance') return true;
      if (job.status === 'rejected') return false;
      const woStatus = wo?.status;
      return !(woStatus === 'completed' || woStatus === 'pending_invoice' || woStatus === 'cancelled');
    };
    const rows = jobs
      .filter(j => ACTIVE(j, woMap.get(j.workOrderId)))
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      .slice(0, limit)
      .map((j): RecentItemRow => {
        const wo = woMap.get(j.workOrderId);
        let label = 'Open';
        let tone: RecentItemRow['statusTone'] = 'blue';
        if (j.status === 'pending_acceptance') { label = 'Accept Job'; tone = 'amber'; }
        else if (wo?.status === 'in-progress') { label = 'In Progress'; tone = 'blue'; }
        else if (wo?.status === 'accepted_by_subcontractor' || wo?.status === 'scheduled') { label = 'Scheduled'; tone = 'blue'; }
        else if (wo?.status === 'repair_approved') { label = 'Repair Approved'; tone = 'green'; }
        return {
          id: j.id,
          title: wo?.title || j.workOrderTitle || j.workOrderNumber || 'Assigned job',
          subtitle: [wo?.locationName || j.locationName, wo?.category || j.category]
            .filter(Boolean)
            .join(' • ') || undefined,
          amount: fmtMoney(typeof wo?.estimateBudget === 'number' ? wo.estimateBudget : undefined),
          statusLabel: label,
          statusTone: tone,
          href: '/subcontractor-portal/assigned',
          actionLabel: j.status === 'pending_acceptance' ? 'Open' : 'View',
        };
      });
    return rows;
  } catch (error) {
    console.error('fetchRecentAssignedJobs error:', error);
    return [];
  }
}

export async function fetchRecentCompletedJobs(
  userId: string,
  db?: Firestore,
  limit = 5,
): Promise<RecentItemRow[]> {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return [];
  try {
    const [primary, legacy] = await Promise.all([
      getDocs(query(collection(dbInstance, 'workOrders'), where('assignedTo', '==', userId))),
      getDocs(query(collection(dbInstance, 'workOrders'), where('assignedSubcontractor', '==', userId))),
    ]);
    const map = new Map<string, DocumentData>();
    [...primary.docs, ...legacy.docs].forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
    const rows = [...map.values()]
      .filter(wo => wo.status === 'completed' || wo.status === 'pending_invoice')
      .sort((a, b) => toMs(b.completedAt || b.updatedAt || b.createdAt) - toMs(a.completedAt || a.updatedAt || a.createdAt))
      .slice(0, limit)
      .map((wo): RecentItemRow => ({
        id: wo.id,
        title: wo.title || wo.workOrderNumber || 'Completed job',
        subtitle: [wo.locationName, wo.category].filter(Boolean).join(' • ') || undefined,
        amount: fmtMoney(typeof wo.estimateBudget === 'number' ? wo.estimateBudget : undefined),
        statusLabel: wo.status === 'pending_invoice' ? 'Pending Invoice' : 'Completed',
        statusTone: wo.status === 'pending_invoice' ? 'amber' : 'green',
        href: '/subcontractor-portal/completed-jobs',
      }));
    return rows;
  } catch (error) {
    console.error('fetchRecentCompletedJobs error:', error);
    return [];
  }
}

// ── Client portal ──────────────────────────────────────────────────────────

export async function fetchRecentClientQuotes(
  userId: string,
  db?: Firestore,
  limit = 5,
): Promise<RecentItemRow[]> {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return [];
  try {
    const snap = await getDocs(query(
      collection(dbInstance, 'quotes'),
      where('clientId', '==', userId),
      where('status', '==', 'sent_to_client'),
    ));
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(q => q.isDiagnosticQuote !== true)
      .sort((a, b) => toMs(b.sentToClientAt || b.createdAt) - toMs(a.sentToClientAt || a.createdAt))
      .slice(0, limit)
      .map((q): RecentItemRow => ({
        id: q.id,
        title: q.workOrderTitle || q.workOrderNumber || 'Quote',
        subtitle: [q.subcontractorName, q.locationName].filter(Boolean).join(' • ') || undefined,
        amount: fmtMoney(typeof q.totalAmount === 'number' ? q.totalAmount : q.amount),
        statusLabel: 'Pending Approval',
        statusTone: 'amber',
        href: '/client-portal/quotes',
        actionLabel: 'Review',
      }));
    return rows;
  } catch (error) {
    console.error('fetchRecentClientQuotes error:', error);
    return [];
  }
}

export async function fetchRecentDiagnosticRequests(
  userId: string,
  db?: Firestore,
  limit = 5,
): Promise<RecentItemRow[]> {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return [];
  try {
    const snap = await getDocs(query(
      collection(dbInstance, 'quotes'),
      where('clientId', '==', userId),
    ));
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(q => q.isDiagnosticQuote === true && q.status === 'sent_to_client')
      .sort((a, b) => toMs(b.sentToClientAt || b.createdAt) - toMs(a.sentToClientAt || a.createdAt))
      .slice(0, limit)
      .map((q): RecentItemRow => ({
        id: q.id,
        title: q.workOrderTitle || q.workOrderNumber || 'Diagnostic visit',
        subtitle: [q.subcontractorName, q.locationName].filter(Boolean).join(' • ') || undefined,
        amount: fmtMoney(typeof q.diagnosticFee === 'number' ? q.diagnosticFee : (typeof q.totalAmount === 'number' ? q.totalAmount : undefined)),
        statusLabel: 'Pending Decision',
        statusTone: 'amber',
        href: '/client-portal/diagnostic-requests',
        actionLabel: 'Review',
      }));
    return rows;
  } catch (error) {
    console.error('fetchRecentDiagnosticRequests error:', error);
    return [];
  }
}

export async function fetchRecentClientInvoices(
  userId: string,
  db?: Firestore,
  limit = 5,
): Promise<RecentItemRow[]> {
  const dbInstance = db || defaultDb;
  if (!dbInstance) return [];
  try {
    const snap = await getDocs(query(
      collection(dbInstance, 'invoices'),
      where('clientId', '==', userId),
      where('status', 'in', ['sent', 'draft', 'overdue']),
    ));
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => toMs(b.sentAt || b.createdAt) - toMs(a.sentAt || a.createdAt))
      .slice(0, limit)
      .map((inv): RecentItemRow => {
        const tone: RecentItemRow['statusTone'] =
          inv.status === 'overdue' ? 'red' : inv.status === 'draft' ? 'gray' : 'amber';
        const label =
          inv.status === 'overdue' ? 'Overdue' : inv.status === 'draft' ? 'Draft' : 'Open';
        return {
          id: inv.id,
          title: inv.invoiceNumber || inv.title || 'Invoice',
          subtitle: [inv.workOrderTitle, inv.locationName].filter(Boolean).join(' • ') || undefined,
          amount: fmtMoney(typeof inv.totalAmount === 'number' ? inv.totalAmount : undefined),
          statusLabel: label,
          statusTone: tone,
          href: `/client-portal/invoices/${inv.id}`,
          actionLabel: 'Pay / View',
        };
      });
    return rows;
  } catch (error) {
    console.error('fetchRecentClientInvoices error:', error);
    return [];
  }
}

// Diagnostic requests aggregate counts for the dashboard section.
export async function calculateDiagnosticRequestsData(userId: string, db?: Firestore) {
  const dbInstance = db || defaultDb;
  const empty = { pendingReview: 0, accepted: 0, rejected: 0, total: 0 };
  if (!dbInstance) return empty;
  try {
    const snap = await getDocs(query(
      collection(dbInstance, 'quotes'),
      where('clientId', '==', userId),
    ));
    const data = { ...empty };
    snap.docs.forEach(d => {
      const q = d.data() as any;
      if (q.isDiagnosticQuote !== true) return;
      data.total += 1;
      if (q.status === 'sent_to_client') data.pendingReview += 1;
      else if (q.status === 'accepted') data.accepted += 1;
      else if (q.status === 'rejected') data.rejected += 1;
    });
    return data;
  } catch (error) {
    console.error('Error calculating diagnostic requests data:', error);
    return empty;
  }
}