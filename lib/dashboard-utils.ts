import { collection, query, where, getDocs, DocumentData, Firestore } from 'firebase/firestore';
import { db as defaultDb } from './firebase';

// Work Orders Data Calculation
export async function calculateWorkOrdersData(
  portalType: 'admin' | 'client' | 'subcontractor',
  userId?: string,
  assignedLocations?: string[],
  db?: Firestore
) {
  const dbInstance = db || defaultDb;
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

        for (let i = 0; i < assignedLocations.length; i += batchSize) {
          const batch = assignedLocations.slice(i, i + batchSize);
          workOrdersQuery = query(
            collection(dbInstance, 'workOrders'),
            where('locationId', 'in', batch)
          );
          const snapshot = await getDocs(workOrdersQuery);
          snapshot.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
        }

        // Also fetch by clientId so work orders linked to client but not in assignedLocations are included
        workOrdersQuery = query(
          collection(dbInstance, 'workOrders'),
          where('clientId', '==', userId)
        );
        const clientIdSnapshot = await getDocs(workOrdersQuery);
        clientIdSnapshot.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));

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
            where('__name__', 'in', batch)
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
    const workOrders = workOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
  db?: Firestore
) {
  try {
    const dbInstance = db || defaultDb;
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
    const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
  db?: Firestore
) {
  try {
    const dbInstance = db || defaultDb;
    let invoicesQuery;
    let workOrdersQuery;

    // Build queries based on portal type
    if (portalType === 'admin') {
      invoicesQuery = query(collection(dbInstance, 'invoices'));
      workOrdersQuery = query(collection(dbInstance, 'workOrders'), where('status', '==', 'completed'));

      const invoicesSnapshot = await getDocs(invoicesQuery);
      const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const workOrdersSnapshot = await getDocs(workOrdersQuery);
      const completedWorkOrders = workOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
            where('__name__', 'in', batch),
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
  try {
    const dbInstance = db || defaultDb;
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
    } else if (bidding.status === 'quote_submitted') {
      data.quoteSubmitted++;
    }
  });

  return data;
}

// My Quotes Data Calculation
export async function calculateMyQuotesData(userId: string, db?: Firestore) {
  try {
    const dbInstance = db || defaultDb;
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
    
    if (status === 'pending' && !quote.forwardedToClient) {
      data.pending++;
    } else if (quote.forwardedToClient && status !== 'accepted' && status !== 'rejected') {
      data.underReview++;
    } else if (status === 'accepted') {
      data.accepted++;
    } else if (status === 'rejected') {
      data.rejected++;
    }
  });

  return data;
}

// Assigned Jobs Data Calculation
export async function calculateAssignedJobsData(userId: string, db?: Firestore) {
  try {
    const dbInstance = db || defaultDb;
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
          where('__name__', 'in', batch)
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
      if (woStatus === 'completed') {
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