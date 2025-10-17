'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, ClipboardList, Receipt, TrendingUp } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    pendingClients: 0,
    pendingSubcontractors: 0,
    pendingLocations: 0,
    pendingWorkOrders: 0,
    totalInvoices: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Pending Clients
        const clientsQuery = query(collection(db, 'clients'), where('status', '==', 'pending'));
        const clientsSnapshot = await getDocs(clientsQuery);
        setStats(prev => ({ ...prev, pendingClients: clientsSnapshot.size }));

        // Pending Subcontractors
        const subsQuery = query(collection(db, 'subcontractors'), where('status', '==', 'pending'));
        const subsSnapshot = await getDocs(subsQuery);
        setStats(prev => ({ ...prev, pendingSubcontractors: subsSnapshot.size }));

        // Pending Locations
        const locationsQuery = query(collection(db, 'locations'), where('status', '==', 'pending'));
        const locationsSnapshot = await getDocs(locationsQuery);
        setStats(prev => ({ ...prev, pendingLocations: locationsSnapshot.size }));

        // Pending Work Orders
        const workOrdersQuery = query(collection(db, 'workOrders'), where('status', '==', 'pending'));
        const workOrdersSnapshot = await getDocs(workOrdersQuery);
        setStats(prev => ({ ...prev, pendingWorkOrders: workOrdersSnapshot.size }));

        // Invoices
        const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
        let totalRevenue = 0;
        invoicesSnapshot.forEach((doc) => {
          const invoice = doc.data();
          if (invoice.status === 'paid') {
            totalRevenue += invoice.totalAmount || 0;
          }
        });
        setStats(prev => ({
          ...prev,
          totalInvoices: invoicesSnapshot.size,
          totalRevenue
        }));
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();

    // Set up real-time listeners for key collections
    const unsubscribeClients = onSnapshot(
      query(collection(db, 'clients'), where('status', '==', 'pending')),
      (snapshot) => setStats(prev => ({ ...prev, pendingClients: snapshot.size }))
    );

    const unsubscribeSubs = onSnapshot(
      query(collection(db, 'subcontractors'), where('status', '==', 'pending')),
      (snapshot) => setStats(prev => ({ ...prev, pendingSubcontractors: snapshot.size }))
    );

    return () => {
      unsubscribeClients();
      unsubscribeSubs();
    };
  }, []);

  const statCards = [
    {
      title: 'Pending Client Approvals',
      value: stats.pendingClients,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Pending Subcontractor Approvals',
      value: stats.pendingSubcontractors,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Pending Location Approvals',
      value: stats.pendingLocations,
      icon: Building2,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Pending Work Orders',
      value: stats.pendingWorkOrders,
      icon: ClipboardList,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Total Invoices',
      value: stats.totalInvoices,
      icon: Receipt,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      title: 'Total Revenue',
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Welcome to your Hey Spruce admin portal</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((stat, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`${stat.bgColor} p-2 rounded-lg`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-gray-600">
              • Review pending client and subcontractor registrations
            </p>
            <p className="text-gray-600">
              • Approve location requests from clients
            </p>
            <p className="text-gray-600">
              • Manage work orders and assign to subcontractors
            </p>
            <p className="text-gray-600">
              • Generate and send invoices with Stripe payment links
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
