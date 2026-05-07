'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import ClientLayout from '@/components/client-layout';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, ChevronRight, ClipboardList } from 'lucide-react';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';

type GroupRow = {
  id: string;
  clientId: string;
  workOrderIds: string[];
  primaryWorkOrderId: string;
  createdAt?: any;
};

export default function ClientWorkOrderGroupsList() {
  const { auth, db } = useFirebaseInstance();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupRow[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'workOrderGroups'),
            where('createdBy.uid', '==', u.uid),
            orderBy('createdAt', 'desc'),
          ),
        );
        // Fall back: also try clientId match if none found (admin-created groups)
        let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GroupRow));
        setGroups(rows);
      } catch (e: any) {
        console.error('Failed to load work order groups:', e);
        // Try a simpler query without the compound filter if index is missing
        try {
          const snap2 = await getDocs(
            query(collection(db, 'workOrderGroups'), orderBy('createdAt', 'desc')),
          );
          setGroups(snap2.docs.map((d) => ({ id: d.id, ...d.data() } as GroupRow)));
        } catch {}
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
    } catch {
      return '—';
    }
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
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground">Bundle</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Work Orders</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groups.map((group, i) => (
                      <tr key={group.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <div>
                              <p className="font-semibold text-foreground">Bundle {i + 1}</p>
                              <p className="text-xs text-muted-foreground font-mono">{group.id.slice(0, 12)}…</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-foreground font-medium">{group.workOrderIds.length}</span>
                            <span className="text-muted-foreground">
                              work order{group.workOrderIds.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">{formatDate(group.createdAt)}</td>
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
