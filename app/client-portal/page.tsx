'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ClipboardList, FileText, Receipt } from 'lucide-react';

export default function ClientDashboard() {
  const [locationsCount, setLocationsCount] = useState(0);
  const [workOrdersCount, setWorkOrdersCount] = useState(0);
  const [pendingQuotesCount, setPendingQuotesCount] = useState(0);
  const [unpaidInvoicesTotal, setUnpaidInvoicesTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        // Fetch locations count
        const locationsQuery = query(
          collection(db, 'locations'),
          where('clientId', '==', currentUser.uid),
          where('status', '==', 'approved')
        );
        const locationsSnapshot = await getDocs(locationsQuery);
        setLocationsCount(locationsSnapshot.size);

        // Fetch work orders count (excluding completed and rejected)
        const workOrdersQuery = query(
          collection(db, 'workOrders'),
          where('clientId', '==', currentUser.uid)
        );
        const workOrdersSnapshot = await getDocs(workOrdersQuery);
        const openWorkOrders = workOrdersSnapshot.docs.filter(
          doc => doc.data().status !== 'completed' && doc.data().status !== 'rejected'
        );
        setWorkOrdersCount(openWorkOrders.length);

        // Fetch pending quotes count (sent_to_client status)
        const quotesQuery = query(
          collection(db, 'quotes'),
          where('clientId', '==', currentUser.uid),
          where('status', '==', 'sent_to_client')
        );
        const quotesSnapshot = await getDocs(quotesQuery);
        setPendingQuotesCount(quotesSnapshot.size);

        // Fetch unpaid invoices total
        const invoicesQuery = query(
          collection(db, 'invoices'),
          where('clientId', '==', currentUser.uid)
        );
        const invoicesSnapshot = await getDocs(invoicesQuery);
        const unpaidTotal = invoicesSnapshot.docs
          .filter(doc => doc.data().status !== 'paid')
          .reduce((total, doc) => total + (doc.data().totalAmount || 0), 0);
        setUnpaidInvoicesTotal(unpaidTotal);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Client Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage your properties and maintenance requests</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">My Locations</CardTitle>
              <Building2 className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : locationsCount}</div>
              <p className="text-xs text-gray-600">Active properties</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Work Orders</CardTitle>
              <ClipboardList className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : workOrdersCount}</div>
              <p className="text-xs text-gray-600">Open requests</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending Quotes</CardTitle>
              <FileText className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : pendingQuotesCount}</div>
              <p className="text-xs text-gray-600">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Unpaid Invoices</CardTitle>
              <Receipt className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : `$${unpaidInvoicesTotal.toLocaleString()}`}</div>
              <p className="text-xs text-gray-600">Total outstanding</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-gray-600">• Create a new location for your property</p>
            <p className="text-gray-600">• Submit a work order for maintenance</p>
            <p className="text-gray-600">• Review and approve quotes from contractors</p>
            <p className="text-gray-600">• Pay outstanding invoices</p>
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
