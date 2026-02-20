'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, ClipboardList, Clock, AlertCircle, FileCheck, Receipt, BarChart2, Calendar } from 'lucide-react';
import Link from 'next/link';
import { formatAddress } from '@/lib/utils';
import AdminCalendar from '@/components/calendar/admin-calendar';

interface Location {
  id: string;
  clientId: string;
  clientName?: string;
  companyId?: string;
  locationName: string;
  address?: { street?: string; city?: string; state?: string; zip?: string; country?: string };
  imageUrl?: string;
  status?: string;
}

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  status: string;
  scheduledServiceDate?: any;
  priority?: string;
}

type CalendarTab = 'all' | 'reactive' | 'planned' | 'proposals';

export default function LocationLandingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [location, setLocation] = useState<Location | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoicesCount, setInvoicesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [calendarTab, setCalendarTab] = useState<CalendarTab>('all');

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      try {
        const locSnap = await getDoc(doc(db, 'locations', id));
        if (!locSnap.exists()) {
          router.push('/admin-portal/locations');
          return;
        }
        setLocation({ id: locSnap.id, ...locSnap.data() } as Location);

        const woSnap = await getDocs(
          query(collection(db, 'workOrders'), where('locationId', '==', id))
        );
        const woList = woSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
        setWorkOrders(woList);

        const woIds = woList.slice(0, 10).map((wo) => wo.id);
        if (woIds.length > 0) {
          const invSnap = await getDocs(
            query(collection(db, 'invoices'), where('workOrderId', 'in', woIds))
          );
          setInvoicesCount(invSnap.size);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id, router]);

  const openWoCount = useMemo(
    () => workOrders.filter((wo) => !['completed', 'cancelled', 'rejected'].includes(wo.status)).length,
    [workOrders]
  );
  const lateToArrive = useMemo(() => 0, []);
  const renewalRequired = useMemo(() => 0, []);
  const plannedCount = useMemo(
    () => workOrders.filter((wo) => wo.status === 'approved' || wo.status === 'assigned').length,
    [workOrders]
  );
  const proposalsCount = useMemo(
    () => workOrders.filter((wo) => wo.status === 'quotes_received' || wo.status === 'bidding').length,
    [workOrders]
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!location) return null;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-4">
          <Link href="/admin-portal/locations">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Locations
            </Button>
          </Link>
        </div>

        {location.imageUrl && (
          <div className="aspect-[21/9] rounded-lg overflow-hidden bg-muted">
            <img
              src={location.imageUrl}
              alt={location.locationName}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{location.locationName}</h1>
          <p className="text-muted-foreground">{formatAddress(location.address)}</p>
        </div>

        {/* Quick stats bar — ServiceChannel style */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Link href={`/admin-portal/work-orders?locationId=${id}`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <ClipboardList className="h-4 w-4" />
                  <span className="text-xs font-medium">Open WOs</span>
                </div>
                <p className="text-2xl font-bold">{openWoCount}</p>
                <span className="text-xs text-muted-foreground">View Open Work Orders</span>
              </CardContent>
            </Card>
          </Link>
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Late to Arrive</span>
              </div>
              <p className="text-2xl font-bold">{lateToArrive}</p>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Renewal Required</span>
              </div>
              <p className="text-2xl font-bold">{renewalRequired}</p>
            </CardContent>
          </Card>
          <Link href={`/admin-portal/invoices`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Receipt className="h-4 w-4" />
                  <span className="text-xs font-medium">Invoices</span>
                </div>
                <p className="text-2xl font-bold">{invoicesCount}</p>
                <span className="text-xs text-muted-foreground">Approve Invoices</span>
              </CardContent>
            </Card>
          </Link>
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileCheck className="h-4 w-4" />
                <span className="text-xs font-medium">Planned</span>
              </div>
              <p className="text-2xl font-bold">{plannedCount}</p>
              <span className="text-xs text-muted-foreground">Planned Maintenance</span>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <BarChart2 className="h-4 w-4" />
                <span className="text-xs font-medium">Proposals</span>
              </div>
              <p className="text-2xl font-bold">{proposalsCount}</p>
              <span className="text-xs text-muted-foreground">Location Analytics</span>
            </CardContent>
          </Card>
        </div>

        {/* Calendar section with tabs */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="h-5 w-5" />
              <CardTitle>Schedule</CardTitle>
              <div className="flex gap-1 ml-auto">
                {(['all', 'reactive', 'planned', 'proposals'] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={calendarTab === tab ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCalendarTab(tab)}
                  >
                    {tab === 'all' && 'All Scheduled WOs'}
                    {tab === 'reactive' && 'Reactive WOs'}
                    {tab === 'planned' && 'Planned Maintenance'}
                    {tab === 'proposals' && 'Proposals'}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <AdminCalendar selectedLocations={location ? [location.locationName] : []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Work Orders at this Location</CardTitle>
          </CardHeader>
          <CardContent>
            {workOrders.length === 0 ? (
              <p className="text-muted-foreground">No work orders at this location.</p>
            ) : (
              <ul className="divide-y">
                {workOrders.slice(0, 10).map((wo) => (
                  <li key={wo.id} className="py-2 flex items-center justify-between">
                    <Link
                      href={`/admin-portal/work-orders/${wo.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {wo.workOrderNumber} — {wo.title}
                    </Link>
                    <span className="text-sm text-muted-foreground">{wo.status}</span>
                  </li>
                ))}
              </ul>
            )}
            {workOrders.length > 10 && (
              <Link href={`/admin-portal/work-orders?locationId=${id}`}>
                <Button variant="outline" size="sm" className="mt-2">
                  View all {workOrders.length} work orders
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
