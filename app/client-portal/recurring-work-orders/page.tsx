'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  RotateCcw, Edit2, Search, Eye,
  AlertCircle, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder } from '@/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
import { Sparkles } from 'lucide-react';
export default function ClientRecurringWorkOrders() {
  const { auth, db } = useFirebaseInstance();
  const router = useRouter();
  const [recurringWorkOrders, setRecurringWorkOrders] = useState<RecurringWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasPermission, setHasPermission] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    /**
     * Map a Firestore recurringWorkOrder doc → typed value with all
     * Timestamp fields converted. Inlined helper so we don't repeat the
     * same conversion three times for the three query branches.
     */
    const mapRwo = (d: any): RecurringWorkOrder => {
      const data = d.data();
      const nextServiceDates = Array.isArray(data.nextServiceDates)
        ? data.nextServiceDates.map((x: any) => {
            if (x instanceof Date) return x;
            if (x?.toDate) return x.toDate();
            return new Date(x);
          })
        : undefined;
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
        nextExecution: data.nextExecution?.toDate(),
        lastExecution: data.lastExecution?.toDate(),
        lastServiced: data.lastServiced?.toDate(),
        nextServiceDates,
      } as RecurringWorkOrder;
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/portal-login');
        return;
      }

      try {
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        if (!clientDoc.exists() || clientDoc.data().status !== 'approved') {
          router.push('/portal-login');
          return;
        }

        const clientData = clientDoc.data();
        setCanCreate(!!(clientData?.permissions?.createRecurringWorkOrders));
        setCanEdit(!!(clientData?.permissions?.editRecurringWorkOrders));
        setHasPermission(true);

        // Single query by clientId — faster than location-batched queries
        // which over-fetch all RWOs for those locations (across all clients).
        const snap = await getDocs(query(
          collection(db, 'recurringWorkOrders'),
          where('clientId', '==', user.uid),
        ));
        setRecurringWorkOrders(snap.docs.map(mapRwo));
        setLoading(false);
      } catch (error: any) {
        console.error('Error fetching recurring work orders:', error);
        toast.error(error.message || 'Failed to load recurring work orders');
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db, router]);

  const filteredRecurringWorkOrders = recurringWorkOrders.filter((rwo) => {
    const statusMatch = filter === 'all' || rwo.status === filter;
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
      <>
      <PageContainer>
        <PortalHero
          title="Recurring Work Orders"
          subtitle=""
          icon={Sparkles}
        />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
            </PageContainer>
    </>
    );
  }

  if (!hasPermission) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-muted-foreground">You do not have permission to view recurring work orders</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <label htmlFor="status-filter" className="text-sm font-medium text-foreground">
            Filter by Status:
          </label>
          <SearchableSelect
            id="status-filter"
            className="w-full sm:w-auto sm:min-w-[200px] sm:max-w-[280px]"
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
                  {canEdit && (
                    <Link href={`/client-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`}>
                      <Button size="sm" variant="outline" className="h-8 px-2" title="Edit">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
