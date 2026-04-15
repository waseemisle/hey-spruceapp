// Admin work order detail — overview + quotes + invoices + vendor payment tabs.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot, collection, query, where, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import ImageView from 'react-native-image-viewing';
import { toast } from 'sonner-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils';
import { createWorkOrderTimelineEvent } from '@/lib/timeline';
import { api } from '@/lib/api';

type Tab = 'overview' | 'quotes' | 'invoices' | 'timeline';

export default function AdminWorkOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const [wo, setWo] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsubWO = onSnapshot(doc(db, 'workOrders', id as string), (s) => {
      if (s.exists()) setWo({ id: s.id, ...s.data() });
    });
    const unsubQ = onSnapshot(
      query(collection(db, 'quotes'), where('workOrderId', '==', id as string)),
      (s) => setQuotes(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsubI = onSnapshot(
      query(collection(db, 'invoices'), where('workOrderId', '==', id as string)),
      (s) => setInvoices(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => { unsubWO(); unsubQ(); unsubI(); };
  }, [id]);

  const approve = async () => {
    const ev = createWorkOrderTimelineEvent({
      type: 'approved', userId: user!.uid, userName: userProfile?.fullName || 'Admin',
      userRole: 'admin', details: 'Approved by admin',
    });
    await updateDoc(doc(db, 'workOrders', wo.id), {
      status: 'approved', approvedBy: user!.uid, approvedAt: serverTimestamp(),
      timeline: arrayUnion(ev), updatedAt: serverTimestamp(),
    });
    api.post('/api/email/send-work-order-approved', { workOrderId: wo.id }).catch(() => {});
    toast.success('Approved');
  };

  const reject = () => {
    Alert.prompt?.('Reject reason', 'Why are you rejecting this WO?', async (reason) => {
      if (!reason) return;
      const ev = createWorkOrderTimelineEvent({
        type: 'rejected', userId: user!.uid, userName: userProfile?.fullName || 'Admin',
        userRole: 'admin', details: `Rejected: ${reason}`,
      });
      await updateDoc(doc(db, 'workOrders', wo.id), {
        status: 'rejected', rejectionReason: reason,
        timeline: arrayUnion(ev), updatedAt: serverTimestamp(),
      });
      toast.success('Rejected');
    });
  };

  if (!wo) return <PageContainer><Text>Loading…</Text></PageContainer>;

  const allImages = [...(wo.images || []), ...(wo.completionImages || [])].map((uri: string) => ({ uri }));

  return (
    <PageContainer>
      <PageHeader title={wo.workOrderNumber} subtitle={wo.title} />
      <View className="flex-row gap-2 mb-3">
        <Badge status={wo.status} />
        {wo.priority ? <Badge priority={wo.priority} /> : null}
      </View>

      {wo.status === 'pending' ? (
        <View className="flex-row gap-2 mb-3">
          <View className="flex-1"><Button onPress={approve}>Approve</Button></View>
          <View className="flex-1"><Button variant="destructive" onPress={reject}>Reject</Button></View>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        {(['overview', 'quotes', 'invoices', 'timeline'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} className={`px-4 py-2 rounded-full mr-2 ${tab === t ? 'bg-navy' : 'bg-secondary'}`}>
            <Text className={`text-xs font-semibold ${tab === t ? 'text-white' : 'text-secondary-foreground'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}{t === 'quotes' ? ` (${quotes.length})` : t === 'invoices' ? ` (${invoices.length})` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab === 'overview' ? (
        <>
          <Card className="mb-3"><Text className="text-sm text-muted-foreground">Client</Text><Text>{wo.clientName}</Text></Card>
          <Card className="mb-3"><Text className="text-sm text-muted-foreground">Location</Text><Text>{wo.location?.locationName}</Text></Card>
          <Card className="mb-3"><CardTitle>Description</CardTitle><Text className="mt-2">{wo.description}</Text></Card>
          {allImages.length ? (
            <Card className="mb-3">
              <CardTitle>Photos</CardTitle>
              <ScrollView horizontal className="mt-2">
                {allImages.map((img: any, i: number) => (
                  <Pressable key={i} onPress={() => setViewerIdx(i)}>
                    <Image source={{ uri: img.uri }} className="w-20 h-20 rounded mr-2" />
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'quotes' ? quotes.map((q) => (
        <Card key={q.id} className="mb-2">
          <View className="flex-row justify-between items-center">
            <CardTitle>{q.subcontractorName}</CardTitle>
            <Badge status={q.status} />
          </View>
          <Text className="text-lg font-bold mt-1">{formatCurrency(q.clientAmount ?? q.totalAmount)}</Text>
          {q.proposedServiceDate ? <Text className="text-xs text-muted-foreground">Proposed {formatDate(q.proposedServiceDate)} {q.proposedServiceTime}</Text> : null}
        </Card>
      )) : null}

      {tab === 'invoices' ? invoices.map((i) => (
        <Card key={i.id} className="mb-2" onPress={() => router.push(`/(admin)/invoices/${i.id}` as any)}>
          <View className="flex-row justify-between items-center">
            <CardTitle>{i.invoiceNumber}</CardTitle>
            <Badge status={i.status} />
          </View>
          <Text className="text-lg font-bold mt-1">{formatCurrency(i.totalAmount)}</Text>
        </Card>
      )) : null}

      {tab === 'timeline' ? (wo.timeline || []).map((t: any, i: number) => (
        <View key={i} className="mb-2 pl-3 border-l-2 border-border">
          <Text className="text-xs font-semibold">{t.type.replace(/_/g, ' ')}</Text>
          <Text className="text-xs text-muted-foreground">{t.userName} · {formatDateTime(t.timestamp)}</Text>
          <Text className="text-sm">{t.details}</Text>
        </View>
      )) : null}

      <ImageView images={allImages} imageIndex={viewerIdx ?? 0} visible={viewerIdx !== null} onRequestClose={() => setViewerIdx(null)} />
    </PageContainer>
  );
}
