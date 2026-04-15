// Client quote detail — Accept / Reject writes the exact diff allowed by firestore.rules
// (status, acceptedAt | rejectedAt | rejectionReason, timeline, systemInformation, updatedAt).
import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { toast } from 'sonner-native';
import { doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { createQuoteTimelineEvent } from '@/lib/timeline';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api';

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const [q, setQ] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'quotes', id as string), (s) => {
      if (s.exists()) setQ({ id: s.id, ...s.data() });
    });
    return () => unsub();
  }, [id]);

  const decide = async (accept: boolean) => {
    if (!q || !user) return;
    if (!accept && !reason.trim()) {
      Alert.alert('Reason required', 'Please briefly explain why you are rejecting this quote.');
      return;
    }
    setLoading(true);
    try {
      const ev = createQuoteTimelineEvent({
        type: accept ? 'accepted' : 'rejected',
        userId: user.uid,
        userName: userProfile?.fullName || 'Client',
        userRole: 'client',
        details: accept ? 'Quote accepted by client' : `Quote rejected: ${reason}`,
      });
      await updateDoc(doc(db, 'quotes', q.id), {
        status: accept ? 'accepted' : 'rejected',
        ...(accept ? { acceptedAt: serverTimestamp() } : { rejectedAt: serverTimestamp(), rejectionReason: reason }),
        timeline: arrayUnion(ev),
        updatedAt: serverTimestamp(),
      });
      api.post('/api/email/send-quote-approval-admin-notification', { quoteId: q.id, accepted: accept }).catch(() => {});
      toast.success(accept ? 'Quote accepted' : 'Quote rejected');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!q) return <PageContainer><Text>Loading…</Text></PageContainer>;
  const decided = q.status === 'accepted' || q.status === 'rejected';

  return (
    <PageContainer>
      <PageHeader title={`Quote from ${q.subcontractorName}`} subtitle={q.workOrderNumber} />
      <View className="flex-row gap-2 mb-3">
        <Badge status={q.status} />
        {q.isBiddingWorkOrder ? <Badge text="Bidding" className="bg-status-purple-bg" /> : null}
      </View>

      <Card className="mb-3">
        <Text className="text-sm text-muted-foreground">Total amount</Text>
        <Text className="text-3xl font-bold text-foreground">
          {formatCurrency(q.clientAmount ?? q.totalAmount)}
        </Text>
        <View className="flex-row justify-between mt-3">
          <View><Text className="text-xs text-muted-foreground">Labor</Text><Text>{formatCurrency(q.laborCost)}</Text></View>
          <View><Text className="text-xs text-muted-foreground">Materials</Text><Text>{formatCurrency(q.materialCost)}</Text></View>
          <View><Text className="text-xs text-muted-foreground">Other</Text><Text>{formatCurrency(q.additionalCosts)}</Text></View>
        </View>
      </Card>

      {q.proposedServiceDate ? (
        <Card className="mb-3">
          <CardTitle>Proposed Service</CardTitle>
          <Text className="mt-2">{formatDate(q.proposedServiceDate)} {q.proposedServiceTime}</Text>
          {q.estimatedDuration ? <Text className="text-xs text-muted-foreground">Duration: {q.estimatedDuration}</Text> : null}
        </Card>
      ) : null}

      {q.lineItems?.length ? (
        <Card className="mb-3">
          <CardTitle>Line items</CardTitle>
          {q.lineItems.map((li: any, i: number) => (
            <View key={i} className="flex-row justify-between py-2 border-b border-border">
              <View className="flex-1"><Text>{li.description}</Text><Text className="text-xs text-muted-foreground">Qty {li.quantity} × {formatCurrency(li.unitPrice)}</Text></View>
              <Text>{formatCurrency(li.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {q.notes ? <Card className="mb-3"><CardTitle>Notes</CardTitle><Text className="mt-2">{q.notes}</Text></Card> : null}
      {q.terms ? <Card className="mb-3"><CardTitle>Terms</CardTitle><Text className="mt-2">{q.terms}</Text></Card> : null}

      {!decided ? (
        <>
          <Textarea label="Rejection reason (if rejecting)" value={reason} onChangeText={setReason} />
          <View className="flex-row gap-2">
            <View className="flex-1"><Button onPress={() => decide(true)} loading={loading}>Accept Quote</Button></View>
            <View className="flex-1"><Button variant="destructive" onPress={() => decide(false)} loading={loading}>Reject</Button></View>
          </View>
        </>
      ) : null}
    </PageContainer>
  );
}
