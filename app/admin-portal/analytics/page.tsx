'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, FileText, Users, Receipt, DollarSign, TrendingUp, Building2 } from 'lucide-react';

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export default function AnalyticsExecutiveDashboard() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [subcontractors, setSubcontractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [woSnap, qSnap, invSnap, subSnap] = await Promise.all([
          getDocs(collection(db, 'workOrders')),
          getDocs(collection(db, 'quotes')),
          getDocs(collection(db, 'invoices')),
          getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved'))),
        ]);
        setWorkOrders(woSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setQuotes(qSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSubcontractors(subSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const kpis = useMemo(() => ({
    woCount: workOrders.length,
    proposals: quotes.filter((q) => q.status === 'pending' || q.status === 'sent_to_client').length,
    contractorsRanking: subcontractors.length,
    totalInvoices: invoices.length,
    uniqueInvoiceAmounts: new Set(invoices.map((i) => i.totalAmount)).size,
    totalInvoiceAmount: invoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0),
  }), [workOrders, quotes, subcontractors, invoices]);

  const woToLocation = useMemo(() => {
    const m: Record<string, { id: string; name: string }> = {};
    workOrders.forEach((wo) => {
      if (wo.locationId && wo.locationName) m[wo.id] = { id: wo.locationId, name: wo.locationName };
    });
    return m;
  }, [workOrders]);

  const spendByLocation = useMemo(() => {
    const byLoc: Record<string, { name: string; amount: number }> = {};
    invoices.forEach((inv) => {
      const loc = (inv as any).workOrderId ? woToLocation[(inv as any).workOrderId] : null;
      const locId = loc?.id ?? (inv as any).locationId ?? 'Other';
      const name = loc?.name ?? (inv as any).locationName ?? inv.workOrderTitle?.split(' — ')[0] ?? locId;
      if (!byLoc[locId]) byLoc[locId] = { name, amount: 0 };
      byLoc[locId].amount += Number(inv.totalAmount) || 0;
    });
    return Object.entries(byLoc)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);
  }, [invoices, woToLocation]);

  const invoiceByMonth = useMemo(() => {
    const byMonth: Record<string, number> = {};
    invoices.forEach((inv) => {
      const d = toDate(inv.createdAt);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] || 0) + (Number(inv.totalAmount) || 0);
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);
  }, [invoices]);

  const repairVsMaintenance = useMemo(() => {
    const repair: string[] = [];
    const maintenance: string[] = [];
    workOrders.forEach((wo) => {
      const cat = (wo.category || '').toLowerCase();
      const title = (wo.title || '').toLowerCase();
      if (cat.includes('repair') || title.includes('repair')) repair.push(wo.id);
      else if (cat.includes('maintenance') || cat.includes('preventive') || title.includes('maintenance')) maintenance.push(wo.id);
      else repair.push(wo.id);
    });
    const repairAmount = invoices
      .filter((i) => repair.includes((i as any).workOrderId))
      .reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
    const maintAmount = invoices
      .filter((i) => maintenance.includes((i as any).workOrderId))
      .reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
    return [
      { label: 'Repair', value: repairAmount, count: repair.length },
      { label: 'Maintenance', value: maintAmount, count: maintenance.length },
    ];
  }, [workOrders, invoices]);

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
      <div className="space-y-8 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Analytics — Executive Dashboard</h1>
          <p className="text-muted-foreground">KPIs and financial overview</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Work Order Count</p>
                  <p className="text-2xl font-bold">{kpis.woCount.toLocaleString()}</p>
                </div>
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Proposals</p>
                  <p className="text-2xl font-bold">{kpis.proposals}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Contractors Ranking</p>
                  <p className="text-2xl font-bold">{kpis.contractorsRanking}</p>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Invoices</p>
                  <p className="text-2xl font-bold">{kpis.totalInvoices.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Unique amounts: {kpis.uniqueInvoiceAmounts}</p>
                </div>
                <Receipt className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Financials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-medium mb-2">Repair vs Maintenance Spend</h4>
              <div className="flex gap-4 items-end h-24">
                {repairVsMaintenance.map((r) => (
                  <div key={r.label} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-primary/80 min-h-[4px]"
                      style={{
                        height: `${Math.max(4, (r.value / Math.max(1, repairVsMaintenance[0].value + repairVsMaintenance[1].value)) * 80)}px`,
                      }}
                    />
                    <span className="text-xs font-medium">{r.label}</span>
                    <span className="text-xs text-muted-foreground">${r.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Top 15 Spend Locations</h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-right font-medium">Invoice Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {spendByLocation.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-4 text-center text-muted-foreground">
                          No invoice data by location
                        </td>
                      </tr>
                    ) : (
                      spendByLocation.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-2">{row.name}</td>
                          <td className="px-4 py-2 text-right font-medium">${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Invoice Amount by Month (last 12 months)</h4>
              <div className="flex gap-1 items-end h-20">
                {invoiceByMonth.map(([month, amount]) => (
                  <div
                    key={month}
                    className="flex-1 flex flex-col items-center gap-0.5 min-w-0"
                    title={`${month}: $${amount.toLocaleString()}`}
                  >
                    <div
                      className="w-full rounded-t bg-primary/70 min-h-[2px]"
                      style={{
                        height: `${Math.max(2, (amount / Math.max(1, ...invoiceByMonth.map(([, v]) => v))) * 60)}px`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">{month.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* WO Volumes + Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              WO Volumes & Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">{workOrders.filter((w) => w.status === 'pending').length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{workOrders.filter((w) => w.status === 'completed').length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{workOrders.filter((w) => w.status === 'assigned' || w.status === 'accepted_by_subcontractor').length}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <div>
                <p className="text-2xl font-bold">${kpis.totalInvoiceAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-muted-foreground">Total Invoice Amount</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
