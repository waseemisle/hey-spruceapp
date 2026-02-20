'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, TrendingUp, AlertCircle, Wrench, Clock } from 'lucide-react';

type AssetTab = 'overview' | 'spend' | 'condition' | 'wo-history' | 'resolution';

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export default function AssetManagementPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AssetTab>('overview');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [woSnap, invSnap] = await Promise.all([
          getDocs(collection(db, 'workOrders')),
          getDocs(collection(db, 'invoices')),
        ]);
        setWorkOrders(woSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const byCategory = useMemo(() => {
    const m: Record<string, { count: number; spend: number; woIds: string[] }> = {};
    workOrders.forEach((wo) => {
      const cat = wo.category || 'Uncategorized';
      if (!m[cat]) m[cat] = { count: 0, spend: 0, woIds: [] };
      m[cat].count += 1;
      m[cat].woIds.push(wo.id);
    });
    invoices.forEach((inv) => {
      const woId = (inv as any).workOrderId;
      if (!woId) return;
      const wo = workOrders.find((w) => w.id === woId);
      const cat = wo?.category || 'Uncategorized';
      if (m[cat]) {
        m[cat].spend += Number(inv.totalAmount) || 0;
      }
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.spend - a.spend);
  }, [workOrders, invoices]);

  const totalSpend = useMemo(() => invoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0), [invoices]);
  const underWarranty = 0; // placeholder

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  const tabs: { id: AssetTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Portfolio Overview', icon: Package },
    { id: 'spend', label: 'Spend Analysis', icon: TrendingUp },
    { id: 'condition', label: 'Condition / Repair-Replace', icon: AlertCircle },
    { id: 'wo-history', label: 'WO Detailed History', icon: Wrench },
    { id: 'resolution', label: 'Resolution Time', icon: Clock },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Asset Management</h1>
          <p className="text-muted-foreground">Portfolio, spend, and repair/replace analysis</p>
        </div>

        <div className="flex flex-wrap gap-2 border-b pb-2">
          {tabs.map((t) => (
            <Button
              key={t.id}
              variant={activeTab === t.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(t.id)}
            >
              <t.icon className="h-4 w-4 mr-1" />
              {t.label}
            </Button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asset Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{workOrders.length}</p>
                <p className="text-muted-foreground text-sm">Total work orders (proxy for asset-related activity)</p>
                <p className="text-lg font-semibold mt-2">{underWarranty}</p>
                <p className="text-muted-foreground text-sm">Under warranty</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Total Spend (invoices)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'spend' && (
          <Card>
            <CardHeader>
              <CardTitle>Spend Analysis by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Category</th>
                      <th className="px-4 py-2 text-right font-medium">WO Count</th>
                      <th className="px-4 py-2 text-right font-medium">Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {byCategory.map((row) => (
                      <tr key={row.name}>
                        <td className="px-4 py-2">{row.name}</td>
                        <td className="px-4 py-2 text-right">{row.count}</td>
                        <td className="px-4 py-2 text-right font-medium">${row.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'condition' && (
          <Card>
            <CardHeader>
              <CardTitle>Repair / Replace Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Analysis based on category spend. Green = repair recommended; red = consider replace.</p>
              <div className="mt-4 border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium w-8" aria-label="Recommendation" />
                      <th className="px-4 py-2 text-left font-medium">Category / Asset</th>
                      <th className="px-4 py-2 text-right font-medium">Spend</th>
                      <th className="px-4 py-2 text-left font-medium">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {byCategory.slice(0, 15).map((row) => {
                      const replaceThreshold = 5000;
                      const recommendReplace = row.spend >= replaceThreshold;
                      return (
                        <tr key={row.name}>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-block w-3 h-3 rounded-full ${recommendReplace ? 'bg-red-500' : 'bg-green-500'}`}
                              title={recommendReplace ? 'Consider replace' : 'Repair'}
                            />
                          </td>
                          <td className="px-4 py-2">{row.name}</td>
                          <td className="px-4 py-2 text-right font-medium">${row.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {recommendReplace ? 'Consider replace' : 'Repair'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'wo-history' && (
          <Card>
            <CardHeader>
              <CardTitle>WO Detailed History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Work orders by category (recent first).</p>
              <ul className="mt-4 divide-y max-h-96 overflow-y-auto">
                {workOrders
                  .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0))
                  .slice(0, 50)
                  .map((wo) => (
                    <li key={wo.id} className="py-2 flex justify-between text-sm">
                      <span>{wo.workOrderNumber} — {wo.title}</span>
                      <span className="text-muted-foreground">{wo.category} · {wo.status}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {activeTab === 'resolution' && (
          <Card>
            <CardHeader>
              <CardTitle>Resolution Time Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Completed work orders: time from creation to completion.</p>
              {workOrders.filter((w) => w.status === 'completed' && w.createdAt && w.completedAt).length === 0 ? (
                <p className="text-muted-foreground mt-2">No completed work orders with dates to analyze.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {workOrders
                    .filter((w) => w.status === 'completed' && w.createdAt && w.completedAt)
                    .slice(0, 20)
                    .map((wo) => {
                      const created = toDate(wo.createdAt);
                      const completed = toDate(wo.completedAt);
                      const days = created && completed ? Math.round((completed.getTime() - created.getTime()) / 86400000) : null;
                      return (
                        <li key={wo.id} className="flex justify-between text-sm">
                          <span>{wo.workOrderNumber}</span>
                          <span>{days != null ? `${days} days` : '—'}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
