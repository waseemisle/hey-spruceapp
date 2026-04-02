'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  documentId,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Input } from '@/components/ui/input';
import {
  ClipboardCheck,
  MapPin,
  Search,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { formatAddress } from '@/lib/utils';
import type { VendorPayment } from '@/types';

interface AssignedJob {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  assignedAt: unknown;
  status: 'pending_acceptance' | 'accepted' | 'rejected';
  scheduledServiceDate?: unknown;
  scheduledServiceTime?: string;
}

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  locationName: string;
  locationAddress: string;
  clientName: string;
  workOrderNumber?: string;
  status: string;
  completedAt?: { toDate?: () => Date };
}

function isCompletedWorkOrder(wo: WorkOrder): boolean {
  return wo.status === 'completed' || wo.status === 'pending_invoice';
}

function completedAtMs(wo: WorkOrder): number {
  const ca = wo.completedAt;
  if (!ca) return 0;
  if (typeof ca.toDate === 'function') return ca.toDate().getTime();
  return 0;
}

const PRIORITY_CONFIG: Record<string, { className: string; dot: string }> = {
  low: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  medium: { className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  high: { className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

export default function SubcontractorCompletedJobs() {
  const { auth, db } = useFirebaseInstance();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrder>>(new Map());
  const [vendorPaymentsByWorkOrderId, setVendorPaymentsByWorkOrderId] = useState<Map<string, VendorPayment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let unsubscribeWorkOrders: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const assignedQuery = query(
          collection(db, 'assignedJobs'),
          where('subcontractorId', '==', user.uid),
          orderBy('assignedAt', 'desc'),
        );

        const unsubscribeSnapshot = onSnapshot(
          assignedQuery,
          async (snapshot) => {
            const assignedData = snapshot.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            })) as AssignedJob[];

            setAssignedJobs(assignedData);

            unsubscribeWorkOrders?.();
            unsubscribeWorkOrders = null;

            const workOrderIds = [...new Set(assignedData.map((j) => j.workOrderId))];

            if (workOrderIds.length > 0) {
              const workOrdersQuery = query(
                collection(db, 'workOrders'),
                where(documentId(), 'in', workOrderIds),
              );

              unsubscribeWorkOrders = onSnapshot(
                workOrdersQuery,
                (woSnapshot) => {
                  const workOrdersMap = new Map<string, WorkOrder>();
                  woSnapshot.docs.forEach((woDoc) => {
                    workOrdersMap.set(woDoc.id, { id: woDoc.id, ...woDoc.data() } as WorkOrder);
                  });
                  setWorkOrders(workOrdersMap);
                  setLoading(false);
                },
                (error) => {
                  console.error('Work orders listener error:', error);
                  setLoading(false);
                },
              );
            } else {
              setWorkOrders(new Map());
              setLoading(false);
            }
          },
          (error) => {
            console.error('Assigned jobs listener error:', error);
            setLoading(false);
          },
        );

        return () => {
          unsubscribeSnapshot();
          unsubscribeWorkOrders?.();
          unsubscribeWorkOrders = null;
        };
      } else {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeWorkOrders?.();
      unsubscribeWorkOrders = null;
    };
  }, [auth, db]);

  const completedRows = useMemo(() => {
    const rows: { job: AssignedJob; workOrder: WorkOrder }[] = [];
    for (const job of assignedJobs) {
      const wo = workOrders.get(job.workOrderId);
      if (wo && isCompletedWorkOrder(wo)) {
        rows.push({ job, workOrder: wo });
      }
    }
    rows.sort((a, b) => completedAtMs(b.workOrder) - completedAtMs(a.workOrder));
    return rows;
  }, [assignedJobs, workOrders]);

  useEffect(() => {
    // Fetch vendor payments in bulk for the completed work orders.
    // Use chunked `in` queries to avoid Firestore limits.
    const workOrderIds = Array.from(new Set(completedRows.map((r) => r.workOrder.id)));
    if (workOrderIds.length === 0) {
      setVendorPaymentsByWorkOrderId(new Map());
      return;
    }

    const chunkSize = 10; // safe default for Firestore 'in' queries
    const chunks: string[][] = [];
    for (let i = 0; i < workOrderIds.length; i += chunkSize) {
      chunks.push(workOrderIds.slice(i, i + chunkSize));
    }

    const unsubscribes: Array<() => void> = [];
    const merged = new Map<string, VendorPayment>();

    chunks.forEach((chunk) => {
      const vpQuery = query(
        collection(db, 'vendorPayments'),
        where('workOrderId', 'in', chunk),
      );

      const unsubscribe = onSnapshot(
        vpQuery,
        (snapshot) => {
          snapshot.docs.forEach((d) => {
            const vp = { id: d.id, ...d.data() } as VendorPayment;
            merged.set(vp.workOrderId, vp);
          });
          // Also clear entries for work orders that no longer have a vendor payment in this snapshot
          // by rebuilding per-chunk keys.
          const snapshotWorkOrderIds = new Set(snapshot.docs.map((d) => (d.data() as any).workOrderId).filter(Boolean));
          chunk.forEach((woId) => {
            if (!snapshotWorkOrderIds.has(woId)) merged.delete(woId);
          });

          setVendorPaymentsByWorkOrderId(new Map(merged));
        },
        (error) => {
          console.error('Vendor payments listener error:', error);
        },
      );
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach((u) => u());
    };
  }, [completedRows, db]);

  const formatMoney = (amount: number, currency = 'USD') => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);
    } catch {
      return `$${(amount || 0).toFixed(2)}`;
    }
  };

  const filteredRows = completedRows.filter(({ workOrder }) => {
    const searchLower = searchQuery.toLowerCase();
    if (!searchQuery) return true;
    return (
      workOrder.title.toLowerCase().includes(searchLower) ||
      (workOrder.workOrderNumber || '').toLowerCase().includes(searchLower) ||
      workOrder.description.toLowerCase().includes(searchLower) ||
      workOrder.clientName.toLowerCase().includes(searchLower) ||
      (workOrder.category || '').toLowerCase().includes(searchLower) ||
      workOrder.locationName.toLowerCase().includes(searchLower) ||
      formatAddress(workOrder.locationAddress).toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-blue-600" />
            My Completed Jobs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Work you finished that is pending invoice or fully completed
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <div className="text-xl font-bold leading-none text-emerald-800">{completedRows.length}</div>
              <div className="text-xs mt-0.5 opacity-80 text-emerald-900">Completed jobs</div>
            </div>
          </div>
        </div>

        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, WO #, client, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredRows.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {completedRows.length === 0 ? 'No completed jobs yet' : 'No matches'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {completedRows.length === 0
                ? 'Jobs you mark complete on Assigned Jobs will show up here.'
                : 'Try a different search.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRows.map(({ job, workOrder }) => {
              const priorityCfg =
                PRIORITY_CONFIG[workOrder.priority] || {
                  className: 'bg-muted text-foreground border-border',
                  dot: 'bg-gray-400',
                };
              const woStatusLabel =
                workOrder.status === 'pending_invoice' ? 'Pending invoice' : 'Completed';
              const woStatusClass =
                workOrder.status === 'pending_invoice'
                  ? 'bg-orange-50 text-orange-800 border-orange-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200';
              const woStatusDot =
                workOrder.status === 'pending_invoice' ? 'bg-orange-500' : 'bg-emerald-500';
              const completedLabel =
                workOrder.completedAt?.toDate?.().toLocaleDateString?.() || '—';
              const vendorPayment = vendorPaymentsByWorkOrderId.get(workOrder.id);
              const vendorPaymentBadgeClass =
                vendorPayment?.status === 'paid'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : vendorPayment
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-muted text-foreground border-border';
              const vendorPaymentLabel =
                vendorPayment?.status === 'paid'
                  ? 'Paid'
                  : vendorPayment
                    ? 'Created'
                    : 'Not created';

              return (
                <div
                  key={job.id}
                  className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-emerald-600" />
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{workOrder.title}</p>
                        {workOrder.workOrderNumber && (
                          <p className="text-xs text-muted-foreground mt-0.5">WO #{workOrder.workOrderNumber}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${woStatusClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${woStatusDot}`} />
                        {woStatusLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{workOrder.locationName || workOrder.clientName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>Completed {completedLabel}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground inline-flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" />
                        Vendor Payment
                      </span>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${vendorPaymentBadgeClass}`}
                        title={vendorPayment ? `Final: ${formatMoney(vendorPayment.finalAmount, vendorPayment.currency)}` : 'No vendor payment yet'}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${vendorPayment ? (vendorPayment.status === 'paid' ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-gray-400'}`} />
                        {vendorPaymentLabel}
                        {vendorPayment ? ` • ${formatMoney(vendorPayment.finalAmount, vendorPayment.currency)}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm gap-2 pt-2 border-t border-border">
                      <span className="text-muted-foreground truncate">{workOrder.category || '—'}</span>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${priorityCfg.className}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                        {workOrder.priority}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SubcontractorLayout>
  );
}
