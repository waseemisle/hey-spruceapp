'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, collection, query, where, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import SubcontractorLayout from '@/components/subcontractor-layout';
import DashboardSearchBar from '@/components/dashboard/dashboard-search-bar';
import BiddingWorkOrdersSection from '@/components/dashboard/bidding-work-orders-section';
import MyQuotesSection from '@/components/dashboard/my-quotes-section';
import AssignedJobsSection from '@/components/dashboard/assigned-jobs-section';
import CompletedJobsSection from '@/components/dashboard/completed-jobs-section';
import SubcontractorCalendar from '@/components/calendar/subcontractor-calendar';
import {
  calculateBiddingWorkOrdersData,
  calculateMyQuotesData,
  calculateAssignedJobsData,
  calculateCompletedJobsData,
  fetchRecentBiddingWorkOrders,
  fetchRecentMyQuotes,
  fetchRecentAssignedJobs,
  fetchRecentCompletedJobs,
  type RecentItemRow,
} from '@/lib/dashboard-utils';

export default function SubcontractorDashboard() {
  const { auth, db } = useFirebaseInstance();
  const [biddingWorkOrdersData, setBiddingWorkOrdersData] = useState({
    pending: 0, quoteSubmitted: 0, total: 0,
  });
  const [myQuotesData, setMyQuotesData] = useState({
    pending: 0, underReview: 0, accepted: 0, rejected: 0, total: 0,
  });
  const [assignedJobsData, setAssignedJobsData] = useState({
    pendingAcceptance: 0, accepted: 0, inProgress: 0, completed: 0, total: 0,
  });
  const [completedJobsData, setCompletedJobsData] = useState({
    total: 0, pendingInvoice: 0, completed: 0,
  });
  const [biddingItems, setBiddingItems] = useState<RecentItemRow[]>([]);
  const [quotesItems, setQuotesItems] = useState<RecentItemRow[]>([]);
  const [assignedItems, setAssignedItems] = useState<RecentItemRow[]>([]);
  const [completedItems, setCompletedItems] = useState<RecentItemRow[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeBidding: (() => void) | null = null;
    let unsubscribeQuotes: (() => void) | null = null;
    let unsubscribeAssigned: (() => void) | null = null;
    let unsubscribeWorkOrderDocs: Array<() => void> = [];

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeBidding?.();
      unsubscribeQuotes?.();
      unsubscribeAssigned?.();
      unsubscribeWorkOrderDocs.forEach((u) => u());
      unsubscribeWorkOrderDocs = [];

      if (!user) {
        setLoading(false);
        return;
      }

      // Stats + recent items always refresh together so the inline list stays
      // consistent with the column totals above it.
      const refreshBidding = async () => {
        const [data, items] = await Promise.all([
          calculateBiddingWorkOrdersData(user.uid, db),
          fetchRecentBiddingWorkOrders(user.uid, db),
        ]);
        setBiddingWorkOrdersData(data);
        setBiddingItems(items);
      };
      const refreshMyQuotes = async () => {
        const [data, items] = await Promise.all([
          calculateMyQuotesData(user.uid, db),
          fetchRecentMyQuotes(user.uid, db),
        ]);
        setMyQuotesData(data);
        setQuotesItems(items);
      };
      const refreshAssigned = async () => {
        const [assignedData, completedData, assignedRecent, completedRecent] = await Promise.all([
          calculateAssignedJobsData(user.uid, db),
          calculateCompletedJobsData(user.uid, db),
          fetchRecentAssignedJobs(user.uid, db),
          fetchRecentCompletedJobs(user.uid, db),
        ]);
        setAssignedJobsData(assignedData);
        setCompletedJobsData(completedData);
        setAssignedItems(assignedRecent);
        setCompletedItems(completedRecent);
      };

      const attachWorkOrderDocListeners = (workOrderIds: string[]) => {
        unsubscribeWorkOrderDocs.forEach((u) => u());
        unsubscribeWorkOrderDocs = [];
        const unique = [...new Set(workOrderIds)].filter(Boolean).slice(0, 30);
        unique.forEach((woId) => {
          const unsub = onSnapshot(
            doc(db, 'workOrders', woId),
            () => {
              void refreshAssigned();
            },
            () => {}
          );
          unsubscribeWorkOrderDocs.push(unsub);
        });
      };

      try {
        await Promise.all([refreshBidding(), refreshMyQuotes(), refreshAssigned()]);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }

      unsubscribeBidding = onSnapshot(
        query(collection(db, 'biddingWorkOrders'), where('subcontractorId', '==', user.uid)),
        () => { void refreshBidding(); },
        (error) => console.error('Bidding work orders listener error:', error),
      );

      unsubscribeQuotes = onSnapshot(
        query(collection(db, 'quotes'), where('subcontractorId', '==', user.uid)),
        () => { void refreshMyQuotes(); },
        (error) => console.error('Quotes listener error:', error),
      );

      unsubscribeAssigned = onSnapshot(
        query(collection(db, 'assignedJobs'), where('subcontractorId', '==', user.uid)),
        (snap) => {
          const ids = snap.docs.map((d) => d.data().workOrderId).filter(Boolean) as string[];
          attachWorkOrderDocListeners(ids);
          void refreshAssigned();
        },
        (error) => console.error('Assigned jobs listener error:', error),
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeBidding?.();
      unsubscribeQuotes?.();
      unsubscribeAssigned?.();
      unsubscribeWorkOrderDocs.forEach((u) => u());
    };
  }, [auth, db]);

  const handleSearch = (_searchType: string, _searchValue: string) => {};

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="min-h-screen bg-muted">
        <DashboardSearchBar portalType="subcontractor" onSearch={handleSearch} />

        <div className="p-4 sm:p-6 space-y-6">
          <SubcontractorCalendar />
          <BiddingWorkOrdersSection data={biddingWorkOrdersData} items={biddingItems} />
          <MyQuotesSection data={myQuotesData} items={quotesItems} />
          <AssignedJobsSection data={assignedJobsData} items={assignedItems} />
          <CompletedJobsSection data={completedJobsData} items={completedItems} />
        </div>
      </div>
    </SubcontractorLayout>
  );
}
