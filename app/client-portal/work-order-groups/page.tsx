'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, ChevronRight, ClipboardList, ShieldOff } from 'lucide-react';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';

type GroupRow = {
  id: string;
  clientId: string;
  companyId?: string | null;
  workOrderIds: string[];
  primaryWorkOrderId: string;
  status?: string;
  createdAt?: any;
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

        // Run both queries in parallel; merge + deduplicate
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
        const rows: GroupRow[] = [];
        for (const snap of snaps) {
          for (const d of snap.docs) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            rows.push({ id: d.id, ...(d.data() as any) });
          }
        }

        rows.sort((a, b) => {
          try {
            return (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0);
          } catch { return 0; }
        });

        setGroups(rows);
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

  const statusBadge = (status?: string) => {
    if (!status || status === 'pending') return null;
    const map: Record<string, string> = {
      approved: 'bg-blue-100 text-blue-800',
      bidding: 'bg-purple-100 text-purple-800',
      assigned: 'bg-indigo-100 text-indigo-800',
      accepted_by_subcontractor: 'bg-teal-100 text-teal-800',
      pending_invoice: 'bg-orange-100 text-orange-800',
      completed: 'bg-green-100 text-green-800',
    };
    const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-700'}`}>
        {label}
      </span>
    );
  };

  return (
    <>
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
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground">Bundle</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groups.map((group) => (
                      <tr key={group.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              {group.workOrderIds.length} combined
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {group.workOrderIds.map((id) => (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 text-xs bg-muted border border-border rounded-lg px-2 py-1"
                              >
                                <ClipboardList className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="font-medium text-foreground">{id.slice(0, 8)}…</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {statusBadge(group.status) || <span className="text-xs text-muted-foreground">Pending</span>}
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
    </>
  );
}
