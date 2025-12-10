'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import DashboardSearchBar from '@/components/dashboard/dashboard-search-bar';
import WorkOrdersSection from '@/components/dashboard/work-orders-section';
import ProposalsSection from '@/components/dashboard/proposals-section';
import InvoicesSection from '@/components/dashboard/invoices-section';
import AdminCalendar from '@/components/calendar/admin-calendar';
import {
  calculateWorkOrdersData,
  calculateProposalsData,
  calculateInvoicesData,
} from '@/lib/dashboard-utils';

export default function AdminDashboard() {
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
    const fetchDashboardData = async () => {
      try {
        // Fetch all dashboard data
        const workOrders = await calculateWorkOrdersData('admin');
        const proposals = await calculateProposalsData('admin');
        const invoices = await calculateInvoicesData('admin');

        setWorkOrdersData(workOrders);
        setProposalsData(proposals);
        setInvoicesData(invoices);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    // Set up real-time listeners
    const unsubscribeWorkOrders = onSnapshot(collection(db, 'workOrders'), async () => {
      const workOrders = await calculateWorkOrdersData('admin');
      setWorkOrdersData(workOrders);
    });

    const unsubscribeQuotes = onSnapshot(collection(db, 'quotes'), async () => {
      const proposals = await calculateProposalsData('admin');
      setProposalsData(proposals);
    });

    const unsubscribeInvoices = onSnapshot(collection(db, 'invoices'), async () => {
      const invoices = await calculateInvoicesData('admin');
      setInvoicesData(invoices);
    });

    return () => {
      unsubscribeWorkOrders();
      unsubscribeQuotes();
      unsubscribeInvoices();
    };
  }, []);

  const handleSearch = (searchType: string, searchValue: string) => {
    // Implement search functionality
    console.log('Search:', searchType, searchValue);
    // TODO: Navigate to appropriate page with search filters
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Search Bar */}
        <DashboardSearchBar portalType="admin" onSearch={handleSearch} />

        {/* Main Content */}
        <div className="p-6 space-y-6">
          {/* Calendar Section */}
          <AdminCalendar />

          {/* Work Orders Section */}
          <WorkOrdersSection data={workOrdersData} portalType="admin" />

          {/* Proposals Section */}
          <ProposalsSection data={proposalsData} portalType="admin" />

          {/* Invoices Section */}
          <InvoicesSection data={invoicesData} portalType="admin" />
        </div>
      </div>
    </AdminLayout>
  );
}
