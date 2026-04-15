import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import ImageView from 'react-native-image-viewing';
import { db } from '@/lib/firebase';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime, formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export default function ClientWorkOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [wo, setWo] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsubWO = onSnapshot(doc(db, 'workOrders', id as string), (snap) => {
      if (snap.exists()) setWo({ id: snap.id, ...snap.data() });
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

  if (!wo) return <PageContainer><Text>Loading…</Text></PageContainer>;

  const allImages = [...(wo.images || []), ...(wo.completionImages || [])].map((uri: string) => ({ uri }));

  return (
    <PageContainer>
      <PageHeader title={wo.workOrderNumber || 'Work Order'} subtitle={wo.title} />
      <View className="flex-row gap-2 mb-3">
        <Badge status={wo.status} />
        {wo.priority ? <Badge priority={wo.priority} /> : null}
      </View>

      <Card className="mb-3">
        <Text className="text-xs text-muted-foreground">Location</Text>
        <Text className="text-foreground">{wo.location?.locationName}</Text>
        <Text className="text-xs text-muted-foreground mt-2">Created</Text>
        <Text className="text-foreground">{formatDateTime(wo.createdAt)}</Text>
        {wo.scheduledServiceDate ? (
          <>
            <Text className="text-xs text-muted-foreground mt-2">Scheduled Service</Text>
            <Text className="text-foreground">{formatDate(wo.scheduledServiceDate)} {wo.scheduledServiceTime}</Text>
          </>
        ) : null}
      </Card>

      <Card className="mb-3">
        <CardTitle>Description</CardTitle>
        <Text className="text-foreground mt-2">{wo.description}</Text>
      </Card>

      {allImages.length ? (
        <Card className="mb-3">
          <CardTitle>Photos</CardTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
            {allImages.map((img: any, i: number) => (
              <Pressable key={i} onPress={() => setViewerIdx(i)}>
                <Image source={{ uri: img.uri }} className="w-20 h-20 rounded mr-2" />
              </Pressable>
            ))}
          </ScrollView>
        </Card>
      ) : null}

      {quotes.length > 0 ? (
        <View className="mb-3">
          <Text className="font-semibold text-foreground mb-2">Quotes</Text>
          {quotes.map((q) => (
            <Card key={q.id} onPress={() => router.push(`/(client)/quotes/${q.id}` as any)} className="mb-2">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-foreground">{q.subcontractorName}</Text>
                <Badge status={q.status} />
              </View>
              <Text className="text-foreground mt-1 text-lg font-bold">{formatCurrency(q.clientAmount ?? q.totalAmount)}</Text>
              {q.proposedServiceDate ? (
                <Text className="text-xs text-muted-foreground mt-1">Proposed: {formatDate(q.proposedServiceDate)} {q.proposedServiceTime}</Text>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      {invoices.length > 0 ? (
        <View className="mb-3">
          <Text className="font-semibold text-foreground mb-2">Invoices</Text>
          {invoices.map((inv) => (
            <Card key={inv.id} onPress={() => router.push(`/(client)/invoices/${inv.id}` as any)} className="mb-2">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-foreground">{inv.invoiceNumber}</Text>
                <Badge status={inv.status} />
              </View>
              <Text className="text-foreground mt-1 text-lg font-bold">{formatCurrency(inv.totalAmount)}</Text>
              <Text className="text-xs text-muted-foreground mt-1">Due {formatDate(inv.dueDate)}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      {wo.timeline?.length ? (
        <Card className="mb-3">
          <CardTitle>Timeline</CardTitle>
          {wo.timeline.map((t: any, i: number) => (
            <View key={i} className="mt-2 pl-3 border-l-2 border-border">
              <Text className="text-xs font-semibold text-foreground">{t.type.replace(/_/g, ' ')}</Text>
              <Text className="text-xs text-muted-foreground">{t.userName} · {formatDateTime(t.timestamp)}</Text>
              <Text className="text-sm text-foreground mt-0.5">{t.details}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <ImageView
        images={allImages}
        imageIndex={viewerIdx ?? 0}
        visible={viewerIdx !== null}
        onRequestClose={() => setViewerIdx(null)}
      />
    </PageContainer>
  );
}
