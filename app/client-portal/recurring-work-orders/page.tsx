'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  RotateCcw, Edit2, Search, Eye,
  Calendar, Clock, CheckCircle, XCircle, AlertCircle, MapPin, Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder } from '@/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ClientRecurringWorkOrders() {
  const { auth, db } = useFirebaseInstance();
  const router = useRouter();
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasPermission, setHasPermission] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [assignedLocations, setAssignedLocations] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Fetch client document to get assigned locations and permissions
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
          if (clientDoc.exists() && clientDoc.data().status === 'approved') {
            const clientData = clientDoc.data();
            const assignedLocationsList = clientData?.assignedLocations || [];
            setAssignedLocations(assignedLocationsList);
            setCanCreate(!!(clientData?.permissions?.createRecurringWorkOrders));

            setHasPermission(true);

            // Fetch recurring work orders for assigned locations
            if (assignedLocationsList.length > 0) {
              // Firestore 'in' query has a limit of 10 items, so we need to batch
              const batches = [];
              for (let i = 0; i < assignedLocationsList.length; i += 10) {
                const batch = assignedLocationsList.slice(i, i + 10);
                batches.push(batch);
              }

              const allRecurringWorkOrders: RecurringWorkOrder[] = [];

              // Fetch for each batch
              for (const batch of batches) {
                const recurringWorkOrdersQuery = query(
                  collection(db, 'recurringWorkOrders'),
                  where('locationId', 'in', batch)
                );
                const snapshot = await getDocs(recurringWorkOrdersQuery);
                const recurringWorkOrdersData = snapshot.docs.map(doc => {
                  const data = doc.data();
                  const nextServiceDates = data.nextServiceDates
                    ? (Array.isArray(data.nextServiceDates)
                        ? data.nextServiceDates.map((d: any) => {
                            if (d instanceof Date) return d;
                            if (d?.toDate) return d.toDate();
                            return new Date(d);
                          })
                        : [])
                    : undefined;
                  
                  return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate(),
                    updatedAt: data.updatedAt?.toDate(),
                    nextExecution: data.nextExecution?.toDate(),
                    lastExecution: data.lastExecution?.toDate(),
                    lastServiced: data.lastServiced?.toDate(),
                    nextServiceDates: nextServiceDates,
                  } as RecurringWorkOrder;
                });
                allRecurringWorkOrders.push(...recurringWorkOrdersData);
              }

              // Also get recurring work orders where clientId matches
              const clientRecurringQuery = query(
                collection(db, 'recurringWorkOrders'),
                where('clientId', '==', user.uid)
              );
              const clientSnapshot = await getDocs(clientRecurringQuery);
              const clientRecurringData = clientSnapshot.docs.map(doc => {
                const data = doc.data();
                const nextServiceDates = data.nextServiceDates
                  ? (Array.isArray(data.nextServiceDates)
                      ? data.nextServiceDates.map((d: any) => {
                          if (d instanceof Date) return d;
                          if (d?.toDate) return d.toDate();
                          return new Date(d);
                        })
                      : [])
                  : undefined;
                
                return {
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt?.toDate(),
                  updatedAt: data.updatedAt?.toDate(),
                  nextExecution: data.nextExecution?.toDate(),
                  lastExecution: data.lastExecution?.toDate(),
                  lastServiced: data.lastServiced?.toDate(),
                  nextServiceDates: nextServiceDates,
                } as RecurringWorkOrder;
              });

              // Combine and remove duplicates
              const combined = [...allRecurringWorkOrders, ...clientRecurringData];
              const unique = combined.filter((rwo, index, self) =>
                index === self.findIndex((r) => r.id === rwo.id)
              );

              setRecurringWorkOrders(unique);
            } else {
              // If no assigned locations, fetch by clientId only
              const clientRecurringQuery = query(
                collection(db, 'recurringWorkOrders'),
                where('clientId', '==', user.uid)
              );
              const snapshot = await getDocs(clientRecurringQuery);
              const recurringWorkOrdersData = snapshot.docs.map(doc => {
                const data = doc.data();
                const nextServiceDates = data.nextServiceDates
                  ? (Array.isArray(data.nextServiceDates)
                      ? data.nextServiceDates.map((d: any) => {
                          if (d instanceof Date) return d;
                          if (d?.toDate) return d.toDate();
                          return new Date(d);
                        })
                      : [])
                  : undefined;
                
                return {
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt?.toDate(),
                  updatedAt: data.updatedAt?.toDate(),
                  nextExecution: data.nextExecution?.toDate(),
                  lastExecution: data.lastExecution?.toDate(),
                  lastServiced: data.lastServiced?.toDate(),
                  nextServiceDates: nextServiceDates,
                } as RecurringWorkOrder;
              });
              setRecurringWorkOrders(recurringWorkOrdersData);
            }

            setLoading(false);
          } else {
            router.push('/portal-login');
          }
        } catch (error: any) {
          console.error('Error fetching recurring work orders:', error);
          toast.error(error.message || 'Failed to load recurring work orders');
          setLoading(false);
        }
      } else {
        router.push('/portal-login');
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db, router]);

  const filteredRecurringWorkOrders = recurringWorkOrders.filter(rwo => {
    // Filter by status
    const statusMatch = filter === 'all' || rwo.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      rwo.title.toLowerCase().includes(searchLower) ||
      rwo.description.toLowerCase().includes(searchLower) ||
      rwo.workOrderNumber.toLowerCase().includes(searchLower) ||
      rwo.category.toLowerCase().includes(searchLower) ||
      (rwo.locationName && rwo.locationName.toLowerCase().includes(searchLower));

    return statusMatch && searchMatch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'paused': return 'text-yellow-600 bg-yellow-50';
      case 'cancelled': return 'text-red-600 bg-red-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const formatRecurrencePattern = (rwo: { recurrencePattern?: any; recurrencePatternLabel?: string }) => {
    const label = (rwo as any).recurrencePatternLabel;
    if (label && ['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'].includes(label)) return label;
    const pattern = rwo.recurrencePattern;
    if (!pattern) return 'Unknown pattern';
    if (pattern.type === 'weekly') return `Every ${pattern.interval} week(s)`;
    if (pattern.type === 'monthly') return `Every ${pattern.interval} month(s)`;
    return 'Unknown pattern';
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  if (!hasPermission) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-muted-foreground">You do not have permission to view recurring work orders</p>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Recurring Work Orders</h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">View and manage recurring work orders</p>
          </div>
          {canCreate && (
            <Link href="/client-portal/recurring-work-orders/create">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Recurring Work Order
              </Button>
            </Link>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recurring work orders by title, description, number, category, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3">
          <label htmlFor="status-filter" className="text-sm font-medium text-foreground">
            Filter by Status:
          </label>
          <SearchableSelect
            id="status-filter"
            className="w-full min-w-[200px] max-w-[280px]"
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
            options={['all', 'active', 'paused', 'cancelled'].map((filterOption) => ({
              value: filterOption,
              label: `${filterOption} (${recurringWorkOrders.filter((rwo) => filterOption === 'all' || rwo.status === filterOption).length})`,
            }))}
            placeholder="Status"
            aria-label="Filter by status"
          />
        </div>

        {/* Recurring Work Orders Grid */}
        {filteredRecurringWorkOrders.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <RotateCcw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No recurring work orders found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecurringWorkOrders.map((recurringWorkOrder) => (
              <div key={recurringWorkOrder.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Row 1: title + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{recurringWorkOrder.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{recurringWorkOrder.locationName || 'No location'}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(recurringWorkOrder.status)}`}>
                    {recurringWorkOrder.status.toUpperCase()}
                  </span>
                </div>
                {/* Row 2: recurrence + category */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate flex items-center gap-1">
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    {formatRecurrencePattern(recurringWorkOrder)}
                  </span>
                  <span className="text-foreground font-medium shrink-0 text-xs">{recurringWorkOrder.category}</span>
                </div>
                {/* Row 3: actions */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  <Link href={`/client-portal/recurring-work-orders/${recurringWorkOrder.id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Button>
                  </Link>
                  <Link href={`/client-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`}>
                    <Button size="sm" variant="outline" className="h-8 px-2" title="Edit">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
