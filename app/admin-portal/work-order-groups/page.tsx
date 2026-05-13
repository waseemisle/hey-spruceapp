'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, ChevronRight, ClipboardList, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '@/lib/firebase';

type WoSummary = { id: string; workOrderNumber?: string; title?: string };

type GroupRow = {
  id: string;
  clientId: string;
  workOrderIds: string[];
  primaryWorkOrderId: string;
  createdAt?: any;
  woSummaries: WoSummary[];
};

export default function AdminWorkOrderGroupsList() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'workOrderGroups'), orderBy('createdAt', 'desc')),
        );
        const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any), woSummaries: [] as WoSummary[] } as GroupRow));

        // Load WO summaries for each group (number + title)
        const enriched = await Promise.all(
          raw.map(async (g) => {
            const ids = Array.isArray(g.workOrderIds) ? g.workOrderIds : [];
            const summaries = await Promise.all(
              ids.map(async (woId) => {
                try {
                  const woSnap = await getDoc(doc(db, 'workOrders', woId));
                  if (!woSnap.exists()) return { id: woId };
                  const d = woSnap.data() as any;
                  return { id: woId, workOrderNumber: d.workOrderNumber, title: d.title };
                } catch {
                  return { id: woId };
                }
              }),
            );
            return { ...g, woSummaries: summaries };
          }),
        );

        setGroups(enriched);
      } catch (e: any) {
        console.error('Failed to load work order groups:', e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleDelete = async (group: GroupRow) => {
    setDeletingId(group.id);
    try {
      const woRefs = group.workOrderIds.map((id) => doc(db, 'workOrders', id));
      const woSnaps = await Promise.all(woRefs.map((ref) => getDoc(ref)));
      const batch = writeBatch(db);
      woSnaps.forEach((snap, i) => {
        if (!snap.exists()) return;
        batch.update(woRefs[i], {
          workOrderGroupId: deleteField(),
          isCombinedPrimary: deleteField(),
          isCombinedChild: deleteField(),
          combinedPrimaryWorkOrderId: deleteField(),
          combinedWorkOrderCount: deleteField(),
        });
      });
      await batch.commit();

      // Delete all biddingWorkOrders docs tied to this group
      const biddingSnaps = await getDocs(query(collection(db, 'biddingWorkOrders'), where('groupId', '==', group.id)));
      await Promise.all(biddingSnaps.docs.map((d) => deleteDoc(d.ref)));

      await deleteDoc(doc(db, 'workOrderGroups', group.id));
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      toast.success('Bundle deleted. Work orders are now independent.');
    } catch (e: any) {
      console.error('Failed to delete work order group:', e);
      toast.error(e?.message || 'Failed to delete bundle');
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  return (
    <>
      <PortalListPage
        title="Combined Work Orders"
        subtitle="Bundles of work orders managed as one unit"
        icon={Layers}
      >

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          </div>
        ) : groups.length === 0 ? (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-10 text-center">
              <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No combined work orders yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select 2 or more work orders on the{' '}
                <Link href="/admin-portal/work-orders" className="text-blue-600 hover:underline">
                  Work Orders
                </Link>{' '}
                page and click &quot;Combine Work Orders&quot;.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground">Work Orders in Bundle</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groups.map((group) => (
                      <tr key={group.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              {group.workOrderIds.length} combined
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.woSummaries.map((wo) => (
                              <Link
                                key={wo.id}
                                href={`/admin-portal/work-orders/${wo.id}`}
                                className="inline-flex items-center gap-1 text-xs bg-muted border border-border rounded-lg px-2 py-1 hover:bg-accent hover:border-blue-300 transition-colors"
                              >
                                <ClipboardList className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="font-semibold text-foreground">
                                  {wo.workOrderNumber || wo.id.slice(0, 8)}
                                </span>
                                {wo.title && (
                                  <span className="text-muted-foreground truncate max-w-[120px]">
                                    · {wo.title}
                                  </span>
                                )}
                              </Link>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(group.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {confirmId === group.id ? (
                              <>
                                <span className="text-xs text-muted-foreground mr-1">Delete bundle?</span>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8"
                                  disabled={deletingId === group.id}
                                  onClick={() => handleDelete(group)}
                                >
                                  {deletingId === group.id ? 'Deleting…' : 'Yes, delete'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() => setConfirmId(null)}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" asChild className="h-8 gap-1">
                                  <Link href={`/admin-portal/work-order-groups/${group.id}`}>
                                    View <ChevronRight className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => setConfirmId(group.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </PortalListPage>
    </>
  );
}
