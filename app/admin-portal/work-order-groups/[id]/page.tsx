'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import AdminLayout from '@/components/admin-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, Layers, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '@/lib/firebase';

type WorkOrderGroup = {
  id: string;
  createdAt?: any;
  createdBy?: { uid?: string; role?: string };
  clientId: string;
  companyId?: string | null;
  workOrderIds: string[];
  primaryWorkOrderId: string;
};

type WorkOrderLite = {
  id: string;
  workOrderNumber?: string;
  title?: string;
  status?: string;
  locationName?: string;
};

export default function AdminWorkOrderGroupDetail() {
  const params = useParams();
  const groupId = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<WorkOrderGroup | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderLite[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        // Admin portal already enforces auth; keep UX consistent.
        return;
      }
      if (!groupId) return;
      setLoading(true);
      try {
        const groupSnap = await getDoc(doc(db, 'workOrderGroups', groupId));
        if (!groupSnap.exists()) {
          toast.error('Combined group not found');
          setGroup(null);
          setWorkOrders([]);
          return;
        }
        const g = { id: groupSnap.id, ...groupSnap.data() } as WorkOrderGroup;
        setGroup(g);

        const ids = Array.isArray(g.workOrderIds) ? g.workOrderIds.map(String) : [];
        const docs = await Promise.all(
          ids.map(async (id) => {
            const woSnap = await getDoc(doc(db, 'workOrders', id));
            if (!woSnap.exists()) return null;
            const d = woSnap.data() as any;
            return {
              id: woSnap.id,
              workOrderNumber: d.workOrderNumber,
              title: d.title,
              status: d.status,
              locationName: d.locationName,
            } satisfies WorkOrderLite;
          }),
        );
        setWorkOrders(docs.filter(Boolean) as WorkOrderLite[]);
      } catch (e: any) {
        console.error('Failed to load work order group:', e);
        toast.error(e?.message || 'Failed to load combined group');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [groupId]);

  const primary = useMemo(
    () => (group ? workOrders.find((w) => w.id === group.primaryWorkOrderId) || null : null),
    [group, workOrders],
  );

  return (
    <AdminLayout>
      <PageContainer>
        <PageHeader
          title="Combined Work Orders"
          subtitle={group ? `Group: ${group.id}` : 'Group'}
          icon={Layers}
          iconClassName="text-blue-600"
          action={(
            <Button variant="outline" asChild className="h-10 rounded-xl px-4 font-semibold">
              <Link href="/admin-portal/work-orders">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Work Orders
              </Link>
            </Button>
          )}
        />

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : !group ? (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-10 text-center text-muted-foreground">
              Group not found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="rounded-2xl border border-border shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Primary work order</p>
                    {primary ? (
                      <Link href={`/admin-portal/work-orders/${primary.id}`} className="inline-flex items-center gap-2 mt-1 text-blue-700 hover:underline">
                        <ClipboardList className="h-4 w-4" />
                        <span className="font-semibold">
                          {primary.workOrderNumber || primary.id}
                        </span>
                        <span className="text-muted-foreground font-normal">
                          {primary.title ? `— ${primary.title}` : ''}
                        </span>
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">{group.primaryWorkOrderId}</p>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {workOrders.length} work order{workOrders.length === 1 ? '' : 's'} in this bundle
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-border bg-muted">
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Work Order</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {workOrders.map((wo) => (
                        <tr key={wo.id} className="hover:bg-muted transition-colors">
                          <td className="px-5 py-3.5">
                            <Link href={`/admin-portal/work-orders/${wo.id}`} className="font-semibold text-foreground hover:underline">
                              {wo.workOrderNumber || wo.id}
                            </Link>
                            {wo.title && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{wo.title}</p>}
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground">{wo.locationName || '—'}</td>
                          <td className="px-4 py-3.5 text-muted-foreground">{wo.status || '—'}</td>
                          <td className="px-5 py-3.5 text-right">
                            <Button size="sm" variant="outline" asChild className="h-8">
                              <Link href={`/admin-portal/work-orders/${wo.id}`}>View</Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </PageContainer>
    </AdminLayout>
  );
}

