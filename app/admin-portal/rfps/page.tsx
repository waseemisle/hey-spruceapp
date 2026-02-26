'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ClipboardList } from 'lucide-react';
import Link from 'next/link';

interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  status: string;
  clientName?: string;
  locationName?: string;
  category?: string;
}

export default function RFPsPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const q = query(
          collection(db, 'workOrders'),
          where('status', 'in', ['bidding', 'quotes_received'])
        );
        const snap = await getDocs(q);
        setWorkOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)));
      } catch (e) {
        console.error('RFPs query failed (status in):', e);
        const snap = await getDocs(collection(db, 'workOrders'));
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
        setWorkOrders(all.filter((wo) => wo.status === 'bidding' || wo.status === 'quotes_received'));
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">RFPs</h1>
          <p className="text-muted-foreground">Request for Proposals — competitive bids and work orders awaiting quotes</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Open RFPs / Bidding ({workOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No open RFPs. Work orders in Bidding or Quotes Received appear here.</p>
                <Link href="/admin-portal/work-orders">
                  <Button variant="outline" className="mt-4">View Work Orders</Button>
                </Link>
              </div>
            ) : (
              <ul className="divide-y">
                {workOrders.map((wo) => (
                  <li key={wo.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <Link href={`/admin-portal/work-orders/${wo.id}`} className="font-medium text-primary hover:underline">
                        {wo.workOrderNumber} — {wo.title}
                      </Link>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {wo.clientName} · {wo.locationName} · {wo.category}
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {wo.status.replace('_', ' ')}
                    </span>
                    <Link href={`/admin-portal/work-orders/${wo.id}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
