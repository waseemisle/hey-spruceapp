'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ClipboardList, FileText, Receipt } from 'lucide-react';
import ClientCalendar from '@/components/calendar/client-calendar';

export default function ClientDashboard() {
  const [locationsCount, setLocationsCount] = useState(0);
  const [workOrdersCount, setWorkOrdersCount] = useState(0);
  const [pendingQuotesCount, setPendingQuotesCount] = useState(0);
  const [unpaidInvoicesTotal, setUnpaidInvoicesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<{ id: string; locationName: string }[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        // Fetch client document to get assigned locations
        const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
        const clientData = clientDoc.data();
        const assignedLocations = clientData?.assignedLocations || [];

        // Fetch locations count - show locations the client has access to
        if (assignedLocations.length > 0) {
          const batchSize = 10;
          let totalLocations = 0;
          const locationsMap = new Map<string, { id: string; locationName: string }>();

          for (let i = 0; i < assignedLocations.length; i += batchSize) {
            const batch = assignedLocations.slice(i, i + batchSize);
            const locationsQuery = query(
              collection(db, 'locations'),
              where('__name__', 'in', batch),
              where('status', '==', 'approved')
            );
            const locationsSnapshot = await getDocs(locationsQuery);
            totalLocations += locationsSnapshot.size;
            locationsSnapshot.docs.forEach(doc => {
              locationsMap.set(doc.id, {
                id: doc.id,
                locationName: doc.data().locationName || doc.data().name || 'Unnamed Location',
              });
            });
          }
          setLocationsCount(totalLocations);
          setLocations(Array.from(locationsMap.values()));
        } else {
          // Fallback to clientId for backward compatibility
          const locationsQuery = query(
            collection(db, 'locations'),
            where('clientId', '==', currentUser.uid),
            where('status', '==', 'approved')
          );
          const locationsSnapshot = await getDocs(locationsQuery);
          setLocationsCount(locationsSnapshot.size);
          const locationsData = locationsSnapshot.docs.map(doc => ({
            id: doc.id,
            locationName: doc.data().locationName || doc.data().name || 'Unnamed Location',
          }));
          setLocations(locationsData);
        }

        // Fetch work orders count based on assigned locations
        if (assignedLocations.length > 0) {
          const batchSize = 10;
          let totalOpenWorkOrders = 0;

          for (let i = 0; i < assignedLocations.length; i += batchSize) {
            const batch = assignedLocations.slice(i, i + batchSize);
            const workOrdersQuery = query(
              collection(db, 'workOrders'),
              where('locationId', 'in', batch)
            );
            const workOrdersSnapshot = await getDocs(workOrdersQuery);
            const openWorkOrders = workOrdersSnapshot.docs.filter(
              doc => doc.data().status !== 'completed' && doc.data().status !== 'rejected'
            );
            totalOpenWorkOrders += openWorkOrders.length;
          }
          setWorkOrdersCount(totalOpenWorkOrders);
        } else {
          // Fallback to clientId for backward compatibility
          const workOrdersQuery = query(
            collection(db, 'workOrders'),
            where('clientId', '==', currentUser.uid)
          );
          const workOrdersSnapshot = await getDocs(workOrdersQuery);
          const openWorkOrders = workOrdersSnapshot.docs.filter(
            doc => doc.data().status !== 'completed' && doc.data().status !== 'rejected'
          );
          setWorkOrdersCount(openWorkOrders.length);
        }

        // Fetch pending quotes count (sent_to_client status)
        // Quotes are already filtered by location in the quotes page, but for dashboard count
        // we'll use clientId for simplicity (quotes page handles location filtering)
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

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Master Calendar</h2>
            {locations.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Filter by Location:</label>
                <select
                  multiple
                  value={selectedLocations}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, option => option.value);
                    setSelectedLocations(values);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm min-w-[200px]"
                >
                  <option value="">All Locations</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.locationName}>
                      {location.locationName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <ClientCalendar 
            selectedLocations={selectedLocations.length > 0 ? selectedLocations : undefined}
            onEventClick={(workOrderId) => {
              window.location.href = `/client-portal/work-orders/${workOrderId}`;
            }}
          />
        </div>
      </div>
    </ClientLayout>
  );
}
