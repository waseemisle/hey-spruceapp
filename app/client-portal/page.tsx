'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, collection, doc, getDoc, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import DashboardSearchBar from '@/components/dashboard/dashboard-search-bar';
import WorkOrdersSection from '@/components/dashboard/work-orders-section';
import ProposalsSection from '@/components/dashboard/proposals-section';
import DiagnosticRequestsSection from '@/components/dashboard/diagnostic-requests-section';
import InvoicesSection from '@/components/dashboard/invoices-section';
import ClientCalendar from '@/components/calendar/client-calendar';
import {
  calculateWorkOrdersData,
  calculateProposalsData,
  calculateInvoicesData,
  calculateDiagnosticRequestsData,
  fetchRecentClientQuotes,
  fetchRecentDiagnosticRequests,
  fetchRecentClientInvoices,
  type RecentItemRow,
} from '@/lib/dashboard-utils';

export default function ClientDashboard() {
  const { auth, db } = useFirebaseInstance();
  const [workOrdersData, setWorkOrdersData] = useState({
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
  });

  const [proposalsData, setProposalsData] = useState({
    pendingApproval: { urgent: 0, total: 0 },
    onHold: 0,
    rejected: 0,
    approved: 0,
  });

  const [diagnosticData, setDiagnosticData] = useState({
    pendingReview: 0, accepted: 0, rejected: 0, total: 0,
  });

  const [invoicesData, setInvoicesData] = useState({
    completedNotInvoiced: 0,
    openReviewed: { count: 0, amount: '0.00', mixedCurrency: false },
    onHold: { count: 0, amount: '0.00' },
    rejected: { count: 0, amount: '0.00' },
  });

  const [quoteItems, setQuoteItems] = useState<RecentItemRow[]>([]);
  const [diagnosticItems, setDiagnosticItems] = useState<RecentItemRow[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<RecentItemRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [_assignedLocations, setAssignedLocations] = useState<string[]>([]);

  useEffect(() => {
    let unsubscribeWorkOrders: (() => void) | undefined;
    let unsubscribeQuotes: (() => void) | undefined;
    let unsubscribeInvoices: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeWorkOrders?.();
      unsubscribeQuotes?.();
      unsubscribeInvoices?.();

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const setupDashboard = async () => {
        try {
          const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
          const clientData = clientDoc.data();
          const locations = clientData?.assignedLocations || [];
          const peerCompanyId = clientData?.companyId as string | undefined;
          setAssignedLocations(locations);

          const recalcWorkOrders = () =>
            calculateWorkOrdersData(
              'client',
              currentUser.uid,
              locations,
              db,
              undefined,
              peerCompanyId
            );

          // Quotes / diagnostic requests / invoices each refresh their stats AND
          // their inline list together so the column counts and rows never drift.
          const refreshQuotes = async () => {
            const [counts, [quotes, diagnostic], dCounts] = await Promise.all([
              calculateProposalsData('client', currentUser.uid, db),
              Promise.all([
                fetchRecentClientQuotes(currentUser.uid, db),
                fetchRecentDiagnosticRequests(currentUser.uid, db),
              ]),
              calculateDiagnosticRequestsData(currentUser.uid, db),
            ]);
            setProposalsData(counts);
            setQuoteItems(quotes);
            setDiagnosticItems(diagnostic);
            setDiagnosticData(dCounts);
          };
          const refreshInvoices = async () => {
            const [counts, items] = await Promise.all([
              calculateInvoicesData('client', currentUser.uid, db),
              fetchRecentClientInvoices(currentUser.uid, db),
            ]);
            setInvoicesData(counts);
            setInvoiceItems(items);
          };

          const [workOrders] = await Promise.all([
            recalcWorkOrders(),
            refreshQuotes(),
            refreshInvoices(),
          ]);
          setWorkOrdersData(workOrders);

          const refreshWorkOrders = async () => {
            const updated = await recalcWorkOrders();
            setWorkOrdersData(updated);
          };

          const workOrderUnsubs: (() => void)[] = [];
          workOrderUnsubs.push(
            onSnapshot(
              query(collection(db, 'workOrders'), where('clientId', '==', currentUser.uid)),
              () => { void refreshWorkOrders(); },
              (error) => console.error('Work orders listener error:', error),
            )
          );
          if (peerCompanyId && locations.length > 0) {
            workOrderUnsubs.push(
              onSnapshot(
                query(collection(db, 'workOrders'), where('companyId', '==', peerCompanyId)),
                () => { void refreshWorkOrders(); },
                (error) => console.error('Work orders (company) listener error:', error),
              )
            );
          }
          unsubscribeWorkOrders = () => workOrderUnsubs.forEach((u) => u());

          unsubscribeQuotes = onSnapshot(
            query(collection(db, 'quotes'), where('clientId', '==', currentUser.uid)),
            () => { void refreshQuotes(); },
            (error) => console.error('Quotes listener error:', error),
          );

          unsubscribeInvoices = onSnapshot(
            query(collection(db, 'invoices'), where('clientId', '==', currentUser.uid)),
            () => { void refreshInvoices(); },
            (error) => console.error('Invoices listener error:', error),
          );
        } catch (error) {
          console.error('Error fetching dashboard data:', error);
        } finally {
          setLoading(false);
        }
      };

      setupDashboard();
    });

    return () => {
      unsubscribeAuth();
      unsubscribeWorkOrders?.();
      unsubscribeQuotes?.();
      unsubscribeInvoices?.();
    };
  }, [auth, db]);

  const handleSearch = (searchType: string, searchValue: string) => {
    console.log('Search:', searchType, searchValue);
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="min-h-screen bg-muted">
        <DashboardSearchBar portalType="client" onSearch={handleSearch} />

        <div className="p-4 sm:p-6 space-y-6">
          <ClientCalendar />
          <WorkOrdersSection data={workOrdersData} portalType="client" />
          <ProposalsSection data={proposalsData} portalType="client" items={quoteItems} />
          <DiagnosticRequestsSection data={diagnosticData} items={diagnosticItems} />
          <InvoicesSection data={invoicesData} portalType="client" items={invoiceItems} />
        </div>
      </div>
    </ClientLayout>
  );
}
