'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
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

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">RFPs</h1>
          <p className="text-muted-foreground">Request for Proposals — competitive bids and work orders awaiting quotes</p>
        </div>

        <div className="flex items-center gap-2 text-sm font-semibold text-foreground pb-1">
          <FileText className="h-4 w-4" />
          Open RFPs / Bidding ({workOrders.length})
        </div>

        {workOrders.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No open RFPs. Work orders in Bidding or Quotes Received appear here.</p>
            <Link href="/admin-portal/work-orders">
              <Button variant="outline" className="mt-4">View Work Orders</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workOrders.map((wo) => (
              <div key={wo.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Row 1: title + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {wo.workOrderNumber ? `${wo.workOrderNumber} — ` : ''}{wo.title}
                  </p>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    {wo.status.replace('_', ' ')}
                  </span>
                </div>
                {/* Row 2: secondary info */}
                <p className="text-sm text-muted-foreground truncate">
                  {[wo.clientName, wo.locationName, wo.category].filter(Boolean).join(' · ')}
                </p>
                {/* Actions */}
                <div className="flex items-center gap-1.5 border-t border-border pt-1">
                  <Link href={`/admin-portal/work-orders/${wo.id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
