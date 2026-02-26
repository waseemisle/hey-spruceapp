'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import SubcontractorLayout from '@/components/subcontractor-layout';
import DashboardSearchBar from '@/components/dashboard/dashboard-search-bar';
import BiddingWorkOrdersSection from '@/components/dashboard/bidding-work-orders-section';
import MyQuotesSection from '@/components/dashboard/my-quotes-section';
import AssignedJobsSection from '@/components/dashboard/assigned-jobs-section';
import SubcontractorCalendar from '@/components/calendar/subcontractor-calendar';
import {
  calculateBiddingWorkOrdersData,
  calculateMyQuotesData,
  calculateAssignedJobsData,
} from '@/lib/dashboard-utils';

export default function SubcontractorDashboard() {
  const { auth, db } = useFirebaseInstance();
  const [biddingWorkOrdersData, setBiddingWorkOrdersData] = useState({
    pending: 0,
    quoteSubmitted: 0,
    total: 0,
  });

  const [myQuotesData, setMyQuotesData] = useState({
    pending: 0,
    underReview: 0,
    accepted: 0,
    rejected: 0,
    total: 0,
  });

  const [assignedJobsData, setAssignedJobsData] = useState({
    pendingAcceptance: 0,
    accepted: 0,
    inProgress: 0,
    completed: 0,
    total: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeBidding: (() => void) | null = null;
    let unsubscribeQuotes: (() => void) | null = null;
    let unsubscribeAssigned: (() => void) | null = null;
    let unsubscribeWorkOrders: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up previous listeners
      unsubscribeBidding?.();
      unsubscribeQuotes?.();
      unsubscribeAssigned?.();
      unsubscribeWorkOrders?.();

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch all dashboard data
        const biddingWorkOrders = await calculateBiddingWorkOrdersData(user.uid, db);
        const myQuotes = await calculateMyQuotesData(user.uid, db);
        const assignedJobs = await calculateAssignedJobsData(user.uid, db);

        setBiddingWorkOrdersData(biddingWorkOrders);
        setMyQuotesData(myQuotes);
        setAssignedJobsData(assignedJobs);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }

      // Set up real-time listeners
      unsubscribeBidding = onSnapshot(collection(db, 'biddingWorkOrders'), async () => {
        const biddingWorkOrders = await calculateBiddingWorkOrdersData(user.uid, db);
        setBiddingWorkOrdersData(biddingWorkOrders);
      });

      unsubscribeQuotes = onSnapshot(collection(db, 'quotes'), async () => {
        const myQuotes = await calculateMyQuotesData(user.uid, db);
        setMyQuotesData(myQuotes);
      });

      unsubscribeAssigned = onSnapshot(collection(db, 'assignedJobs'), async () => {
        const assignedJobs = await calculateAssignedJobsData(user.uid, db);
        setAssignedJobsData(assignedJobs);
      });

      // Also listen to workOrders since assigned jobs depend on work order status
      unsubscribeWorkOrders = onSnapshot(collection(db, 'workOrders'), async () => {
        const assignedJobs = await calculateAssignedJobsData(user.uid, db);
        setAssignedJobsData(assignedJobs);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeBidding?.();
      unsubscribeQuotes?.();
      unsubscribeAssigned?.();
      unsubscribeWorkOrders?.();
    };
  }, [auth, db]);

  const handleSearch = (searchType: string, searchValue: string) => {
    // Implement search functionality
    console.log('Search:', searchType, searchValue);
    // TODO: Navigate to appropriate page with search filters
  };

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Search Bar */}
        <DashboardSearchBar portalType="subcontractor" onSearch={handleSearch} />

        {/* Main Content */}
        <div className="p-6 space-y-6">
          {/* Calendar Section */}
          <SubcontractorCalendar />

          {/* Bidding Work Orders Section */}
          <BiddingWorkOrdersSection data={biddingWorkOrdersData} />

          {/* My Quotes Section */}
          <MyQuotesSection data={myQuotesData} />

          {/* Assigned Jobs Section */}
          <AssignedJobsSection data={assignedJobsData} />
        </div>
      </div>
    </SubcontractorLayout>
  );
}
