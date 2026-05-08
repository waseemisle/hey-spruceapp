'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import ClientLayout from '@/components/client-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, ChevronRight, ClipboardList, ShieldOff } from 'lucide-react';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';

type WoSummary = { id: string; workOrderNumber?: string; title?: string };

type GroupRow = {
  id: string;
  clientId: string;
  companyId?: string | null;
  workOrderIds: string[];
  primaryWorkOrderId: string;
  createdAt?: any;
  woSummaries: WoSummary[];
};

export default function ClientWorkOrderGroupsList() {
  const { auth, db } = useFirebaseInstance();
  const [loading, setLoading] = useState(true);
  const [permitted, setPermitted] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      setLoading(true);
      try {
        // Load client doc once — get permission + companyId
        const clientSnap = await getDoc(doc(db, 'clients', u.uid));
        const clientData = clientSnap.exists() ? (clientSnap.data() as any) : {};
        const perms = clientData.permissions || {};
        if (!perms.combineWorkOrders) {
          setPermitted(false);
          setLoading(false);
          return;
        }
        setPermitted(true);

        const companyId: string | null = clientData.companyId || null;

        // Query workOrderGroups by clientId AND (if in a company) by companyId.
        // Run both queries in parallel; merge + deduplicate results.
        // Firestore security rules allow reads via either path, so no extra
        // index is required for single-field equality queries.
        const queries = [
          getDocs(query(collection(db, 'workOrderGroups'), where('clientId', '==', u.uid))),
        ];
        if (companyId) {
          queries.push(
            getDocs(query(collection(db, 'workOrderGroups'), where('companyId', '==', companyId))),
          );
        }

        const snaps = await Promise.all(queries);

        const seen = new Set<string>();
        const rawGroups: Omit<GroupRow, 'woSummaries'>[] = [];
        for (const snap of snaps) {
          for (const d of snap.docs) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            rawGroups.push({ id: d.id, ...(d.data() as any) });
          }
        }

        // Load WO summaries for each group from its workOrderIds list
        const enriched: GroupRow[] = await Promise.all(
          rawGroups.map(async (g) => {
            const ids: string[] = Array.isArray(g.workOrderIds) ? g.workOrderIds : [];
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

        enriched.sort((a, b) => {
          try {
            return (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0);
          } catch { return 0; }
        });

        setGroups(enriched);
      } catch (e: any) {
        console.error('Failed to load work order groups:', e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [auth, db]);

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return '—'; }
  };

  return (
    <ClientLayout>
      <PageContainer>
        <PageHeader
          title="Combined Work Orders"
          subtitle="Bundles of work orders managed as one unit"
          icon={Layers}
          iconClassName="text-blue-600"
        />

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : !permitted ? (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-10 text-center">
              <ShieldOff className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">You don&apos;t have permission to view combined work orders.</p>
            </CardContent>
          </Card>
        ) : groups.length === 0 ? (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-10 text-center">
              <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No combined work orders yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select 2 or more work orders on the{' '}
                <Link href="/client-portal/work-orders" className="text-blue-600 hover:underline">
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
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground">Work Orders in Bundle</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groups.map((group) => (
                      <tr key={group.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              {group.woSummaries.length || group.workOrderIds.length} combined
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.woSummaries.map((wo) => (
                              <span
                                key={wo.id}
                                className="inline-flex items-center gap-1 text-xs bg-muted border border-border rounded-lg px-2 py-1"
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
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(group.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button size="sm" variant="outline" asChild className="h-8 gap-1">
                            <Link href={`/client-portal/work-order-groups/${group.id}`}>
                              View <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </PageContainer>
    </ClientLayout>
  );
}
