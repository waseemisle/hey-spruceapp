import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard, StatRow } from '@/components/ui/StatCards';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/ui/Logo';
import { NotificationBell } from '@/components/NotificationBell';
import { formatDate } from '@/lib/utils';

export default function SubDashboard() {
  const { user, userProfile } = useAuth();
  const [bidding, setBidding] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubB = onSnapshot(
      query(collection(db, 'biddingWorkOrders'), where('subcontractorId', '==', user.uid)),
      (s) => setBidding(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsubA = onSnapshot(
      query(collection(db, 'assignedJobs'), where('subcontractorId', '==', user.uid)),
      (s) => setAssigned(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsubQ = onSnapshot(
      query(collection(db, 'quotes'), where('subcontractorId', '==', user.uid)),
      (s) => setQuotes(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => { unsubB(); unsubA(); unsubQ(); };
  }, [user]);

  return (
    <PageContainer>
      <View className="flex-row items-center justify-between mb-3">
        <Logo size={32} />
        <NotificationBell />
      </View>
      <PageHeader title={`Hello, ${userProfile?.fullName?.split(' ')[0] || 'there'}`} subtitle={userProfile?.businessName} />

      <StatRow>
        <StatCard label="Open Bids" value={bidding.filter((b) => b.status === 'pending').length} tone="yellow" />
        <StatCard label="Active Jobs" value={assigned.filter((a) => a.status === 'accepted').length} tone="blue" />
      </StatRow>
      <StatRow>
        <StatCard label="Quotes Sent" value={quotes.filter((q) => q.status === 'pending' || q.status === 'sent_to_client').length} />
        <StatCard label="Accepted" value={quotes.filter((q) => q.status === 'accepted').length} tone="green" />
      </StatRow>

      <Text className="font-semibold text-foreground mb-2">Latest bidding opportunities</Text>
      {bidding.slice(0, 5).map((b) => (
        <Card key={b.id} className="mb-2">
          <View className="flex-row items-center justify-between">
            <CardTitle>{b.workOrderNumber || b.workOrderId?.slice(0, 8)}</CardTitle>
            <Badge status={b.status} />
          </View>
          <Text className="text-sm text-foreground mt-1" numberOfLines={1}>{b.workOrderTitle}</Text>
          <Text className="text-xs text-muted-foreground mt-1">Shared {formatDate(b.sharedAt)}</Text>
        </Card>
      ))}
    </PageContainer>
  );
}
