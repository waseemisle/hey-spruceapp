'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import SubcontractorLayout from '@/components/subcontractor-layout';
import DashboardSearchBar from '@/components/dashboard/dashboard-search-bar';
import WorkOrdersSection from '@/components/dashboard/work-orders-section';
import ProposalsSection from '@/components/dashboard/proposals-section';
import InvoicesSection from '@/components/dashboard/invoices-section';
import {
  calculateWorkOrdersData,
  calculateProposalsData,
  calculateInvoicesData,
} from '@/lib/dashboard-utils';

export default function SubcontractorDashboard() {
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

  const [invoicesData, setInvoicesData] = useState({
    completedNotInvoiced: 0,
    openReviewed: { count: 0, amount: '0.00', mixedCurrency: false },
    onHold: { count: 0, amount: '0.00' },
    rejected: { count: 0, amount: '0.00' },
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch all dashboard data
        const workOrders = await calculateWorkOrdersData('subcontractor', user.uid);
        const proposals = await calculateProposalsData('subcontractor', user.uid);
        const invoices = await calculateInvoicesData('subcontractor', user.uid);

        setWorkOrdersData(workOrders);
        setProposalsData(proposals);
        setInvoicesData(invoices);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }

      // Set up real-time listeners
      const unsubscribeWorkOrders = onSnapshot(collection(db, 'assignedJobs'), async () => {
        const workOrders = await calculateWorkOrdersData('subcontractor', user.uid);
        setWorkOrdersData(workOrders);
      });

      const unsubscribeQuotes = onSnapshot(collection(db, 'quotes'), async () => {
        const proposals = await calculateProposalsData('subcontractor', user.uid);
        setProposalsData(proposals);
      });

      const unsubscribeInvoices = onSnapshot(collection(db, 'invoices'), async () => {
        const invoices = await calculateInvoicesData('subcontractor', user.uid);
        setInvoicesData(invoices);
      });

      return () => {
        unsubscribeWorkOrders();
        unsubscribeQuotes();
        unsubscribeInvoices();
      };
    });

    return () => unsubscribeAuth();
  }, []);

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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
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
          {/* Work Orders Section */}
          <WorkOrdersSection data={workOrdersData} portalType="subcontractor" />

          {/* Proposals Section */}
          <ProposalsSection data={proposalsData} portalType="subcontractor" />

          {/* Invoices Section */}
          <InvoicesSection data={invoicesData} portalType="subcontractor" />
        </div>
      </div>
    </SubcontractorLayout>
  );
}
