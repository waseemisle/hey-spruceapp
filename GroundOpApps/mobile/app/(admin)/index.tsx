// Admin dashboard — ServiceChannel-style three sections (Work Orders / Proposals / Invoices).
// Matches web newtemp.md requirements. Simplified to vertical stack for mobile.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { NotificationBell } from '@/components/NotificationBell';

function Section({ title, columns }: { title: string; columns: Array<{ label: string; count: number; tone?: string }> }) {
  return (
    <Card className="mb-3">
      <Text className="text-base font-bold text-foreground mb-3">{title}</Text>
      <View className="flex-row flex-wrap">
        {columns.map((c, i) => (
          <View key={i} className="w-1/2 mb-3">
            <Text className="text-xs text-muted-foreground">{c.label}</Text>
            <Text className={`text-2xl font-bold ${c.tone === 'red' ? 'text-status-red-fg' : c.tone === 'blue' ? 'text-emphasis' : 'text-foreground'}`}>
              {c.count}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const [wo, setWO] = useState<any[]>([]);
  const [q, setQ] = useState<any[]>([]);
  const [inv, setInv] = useState<any[]>([]);

  useEffect(() => {
    const unsubW = onSnapshot(collection(db, 'workOrders'), (s) => setWO(s.docs.map((d) => d.data() as any)));
    const unsubQ = onSnapshot(collection(db, 'quotes'), (s) => setQ(s.docs.map((d) => d.data() as any)));
    const unsubI = onSnapshot(collection(db, 'invoices'), (s) => setInv(s.docs.map((d) => d.data() as any)));
    return () => { unsubW(); unsubQ(); unsubI(); };
  }, []);

  return (
    <PageContainer>
      <View className="flex-row items-center justify-between mb-3">
        <Logo />
        <NotificationBell />
      </View>
      <PageHeader title="Admin Dashboard" subtitle={userProfile?.fullName} />

      <Section
        title="Work Orders"
        columns={[
          { label: 'Dispatch Not Confirmed', count: wo.filter((w) => w.status === 'approved' && !w.assignedTo).length, tone: 'red' },
          { label: 'Declined By Provider', count: wo.filter((w) => w.status === 'rejected_by_subcontractor').length },
          { label: 'Late to Arrive', count: wo.filter((w) => w.status === 'assigned' && w.scheduledServiceDate?.toDate?.() < new Date()).length, tone: 'red' },
          { label: 'In Progress', count: wo.filter((w) => w.status === 'in-progress').length, tone: 'blue' },
          { label: 'Waiting for Quote', count: wo.filter((w) => ['bidding', 'quote_received', 'quotes_received'].includes(w.status)).length },
          { label: 'Pending Confirmation', count: wo.filter((w) => w.status === 'pending').length, tone: 'blue' },
        ]}
      />

      <Section
        title="Proposals"
        columns={[
          { label: 'Pending Approval', count: q.filter((x) => x.status === 'pending').length, tone: 'red' },
          { label: 'Sent to Client', count: q.filter((x) => x.status === 'sent_to_client').length, tone: 'blue' },
          { label: 'Rejected', count: q.filter((x) => x.status === 'rejected').length },
          { label: 'Approved', count: q.filter((x) => x.status === 'accepted').length, tone: 'blue' },
        ]}
      />

      <Section
        title="Invoices"
        columns={[
          { label: 'Completed Not Invoiced', count: wo.filter((w) => w.status === 'completed' && !inv.find((i) => i.workOrderId === (w as any).id)).length, tone: 'blue' },
          { label: 'Open & Reviewed', count: inv.filter((i) => i.status === 'sent').length, tone: 'blue' },
          { label: 'Overdue', count: inv.filter((i) => i.status === 'overdue').length, tone: 'red' },
          { label: 'Paid', count: inv.filter((i) => i.status === 'paid').length },
        ]}
      />
    </PageContainer>
  );
}
