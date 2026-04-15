// Subcontractor bidding — submit quote with proposed date/time (required fields per web).
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  collection, onSnapshot, query, where,
  addDoc, updateDoc, doc, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import { toast } from 'sonner-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createQuoteTimelineEvent } from '@/lib/timeline';
import { api } from '@/lib/api';

export default function Bidding() {
  const { user, userProfile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'biddingWorkOrders'), where('subcontractorId', '==', user.uid)),
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, [user]);

  return (
    <PageContainer scroll={false}>
      <PageHeader title="Bidding Work Orders" />
      {items.length === 0 ? (
        <EmptyState title="No open bids" description="You'll see work orders shared with you here." />
      ) : (
        <FlashList
          data={items}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card onPress={() => setActive(item)} className="mb-2">
              <View className="flex-row items-center justify-between">
                <CardTitle>{item.workOrderNumber || item.workOrderId?.slice(0, 8)}</CardTitle>
                <Badge status={item.status} />
              </View>
              <Text className="text-sm mt-1" numberOfLines={2}>{item.workOrderTitle}</Text>
              <Text className="text-xs text-muted-foreground mt-1">{item.workOrderLocation?.locationName}</Text>
              <Text className="text-xs text-muted-foreground mt-1">Shared {formatDate(item.sharedAt)}</Text>
            </Card>
          )}
        />
      )}
      {active ? (
        <QuoteSheet item={active} onClose={() => setActive(null)} user={user} userProfile={userProfile} />
      ) : null}
    </PageContainer>
  );
}

function QuoteSheet({ item, onClose, user, userProfile }: any) {
  const [labor, setLabor] = useState('');
  const [material, setMaterial] = useState('');
  const [additional, setAdditional] = useState('');
  const [notes, setNotes] = useState('');
  const [estDuration, setEstDuration] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const total = (+labor || 0) + (+material || 0) + (+additional || 0);
    if (total <= 0) { Alert.alert('Amount required'); return; }
    setLoading(true);
    try {
      const proposedTimeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const ev = createQuoteTimelineEvent({
        type: 'created',
        userId: user.uid,
        userName: userProfile?.fullName || 'Subcontractor',
        userRole: 'subcontractor',
        details: 'Quote submitted via bidding',
      });
      await addDoc(collection(db, 'quotes'), {
        workOrderId: item.workOrderId,
        biddingWorkOrderId: item.id,
        workOrderNumber: item.workOrderNumber,
        workOrderTitle: item.workOrderTitle,
        workOrderDescription: item.workOrderDescription,
        workOrderLocation: item.workOrderLocation,
        clientId: item.clientId,
        clientName: item.clientName,
        subcontractorId: user.uid,
        subcontractorName: userProfile?.fullName,
        subcontractorEmail: userProfile?.email,
        laborCost: +labor || 0,
        materialCost: +material || 0,
        additionalCosts: +additional || 0,
        discountAmount: 0,
        totalAmount: total,
        originalAmount: total,
        clientAmount: total,
        markupPercentage: 0,
        lineItems: [],
        notes,
        terms: '',
        validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        proposedServiceDate: date,
        proposedServiceTime: proposedTimeStr,
        estimatedDuration: estDuration,
        status: 'pending',
        isBiddingWorkOrder: true,
        creationSource: 'subcontractor_bidding',
        timeline: [ev],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'biddingWorkOrders', item.id), {
        status: 'quoted',
        quotedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      api.post('/api/email/send-quote-notification', { workOrderId: item.workOrderId }).catch(() => {});
      toast.success('Quote submitted');
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <PageContainer>
        <PageHeader title="Submit Quote" subtitle={item.workOrderTitle} actions={<Button size="sm" variant="ghost" onPress={onClose}>Close</Button>} />
        <Input label="Labor cost" keyboardType="numeric" value={labor} onChangeText={setLabor} placeholder="0.00" />
        <Input label="Material cost" keyboardType="numeric" value={material} onChangeText={setMaterial} placeholder="0.00" />
        <Input label="Additional cost" keyboardType="numeric" value={additional} onChangeText={setAdditional} placeholder="0.00" />
        <Text className="text-sm font-semibold mb-1">Proposed service date *</Text>
        <Button variant="outline" onPress={() => setShowDate(true)}>{date.toDateString()}</Button>
        {showDate && <DateTimePicker value={date} mode="date" onChange={(_: any, d?: Date) => { setShowDate(false); if (d) setDate(d); }} />}
        <View className="mt-3" />
        <Text className="text-sm font-semibold mb-1">Proposed time *</Text>
        <Button variant="outline" onPress={() => setShowTime(true)}>{time.toLocaleTimeString()}</Button>
        {showTime && <DateTimePicker value={time} mode="time" onChange={(_: any, d?: Date) => { setShowTime(false); if (d) setTime(d); }} />}
        <View className="mt-3" />
        <Input label="Estimated duration" value={estDuration} onChangeText={setEstDuration} placeholder="2-3 days" />
        <Textarea label="Notes" value={notes} onChangeText={setNotes} />
        <Text className="text-right font-bold text-xl mb-3">
          Total: {formatCurrency((+labor||0)+(+material||0)+(+additional||0))}
        </Text>
        <Button onPress={submit} loading={loading}>Submit Quote</Button>
      </PageContainer>
    </Modal>
  );
}
