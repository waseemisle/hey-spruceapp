import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Plus } from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { StatCard, StatRow } from '@/components/ui/StatCards';
import { Badge } from '@/components/ui/Badge';
import { NotificationBell } from '@/components/NotificationBell';
import { Logo } from '@/components/ui/Logo';
import { formatDate } from '@/lib/utils';

export default function ClientDashboard() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    // Firestore-index-safe: use clientId equality only; filter/sort client-side.
    const unsubWO = onSnapshot(
      query(collection(db, 'workOrders'), where('clientId', '==', user.uid)),
      (snap) => setWorkOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsubQ = onSnapshot(
      query(collection(db, 'quotes'), where('clientId', '==', user.uid)),
      (snap) => setQuotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsubI = onSnapshot(
      query(collection(db, 'invoices'), where('clientId', '==', user.uid)),
      (snap) => setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => { unsubWO(); unsubQ(); unsubI(); };
  }, [user]);

  const pendingWO = workOrders.filter((w) => w.status === 'pending').length;
  const inProgress = workOrders.filter((w) => ['assigned', 'in-progress'].includes(w.status)).length;
  const pendingQuotes = quotes.filter((q) => q.status === 'sent_to_client').length;
  const openInvoices = invoices.filter((i) => ['sent', 'overdue'].includes(i.status)).length;

  return (
    <PageContainer>
      <View className="flex-row items-center justify-between mb-3">
        <Logo size={32} />
        <NotificationBell />
      </View>
      <PageHeader
        title={`Welcome, ${userProfile?.fullName?.split(' ')[0] || 'there'}`}
        subtitle={userProfile?.companyName}
      />

      <StatRow>
        <StatCard label="Pending WOs" value={pendingWO} tone="yellow" />
        <StatCard label="In Progress" value={inProgress} tone="blue" />
      </StatRow>
      <StatRow>
        <StatCard label="Quotes to Review" value={pendingQuotes} tone="blue" />
        <StatCard label="Open Invoices" value={openInvoices} tone="red" />
      </StatRow>

      <Pressable
        onPress={() => router.push('/(client)/work-orders/create')}
        className="bg-navy flex-row items-center justify-center py-3 rounded-lg mb-4"
      >
        <Plus size={18} color="#fff" />
        <Text className="text-white font-semibold ml-2">Create Service Request</Text>
      </Pressable>

      <Text className="font-semibold text-foreground mb-2">Recent Work Orders</Text>
      {workOrders.slice(0, 5).map((wo) => (
        <Card key={wo.id} onPress={() => router.push(`/(client)/work-orders/${wo.id}` as any)} className="mb-2">
          <View className="flex-row items-center justify-between mb-1">
            <CardTitle>{wo.workOrderNumber || wo.id.slice(0, 8)}</CardTitle>
            <Badge status={wo.status} />
          </View>
          <Text className="text-sm text-foreground" numberOfLines={1}>{wo.title}</Text>
          <Text className="text-xs text-muted-foreground mt-1">{formatDate(wo.createdAt)}</Text>
        </Card>
      ))}
    </PageContainer>
  );
}
