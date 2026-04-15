import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from 'sonner-native';
import { Alert } from 'react-native';

export default function AdminInvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inv, setInv] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'invoices', id as string), (s) => {
      if (s.exists()) setInv({ id: s.id, ...s.data() });
    });
    return () => unsub();
  }, [id]);

  const sendToClient = async () => {
    setBusy(true);
    try { await api.post('/api/email/send-invoice', { invoiceId: inv.id }); toast.success('Invoice sent'); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  const chargeSaved = async () => {
    setBusy(true);
    try { await api.post('/api/stripe/charge-saved-card', { invoiceId: inv.id }); toast.success('Charge initiated'); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  if (!inv) return <PageContainer><Text>Loading…</Text></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title={inv.invoiceNumber} subtitle={inv.workOrderNumber} />
      <Badge status={inv.status} />

      <Card className="mt-3 mb-3">
        <Text className="text-sm text-muted-foreground">Amount</Text>
        <Text className="text-3xl font-bold">{formatCurrency(inv.totalAmount)}</Text>
        <Text className="text-xs text-muted-foreground mt-2">Due {formatDate(inv.dueDate)}</Text>
        <Text className="text-xs text-muted-foreground mt-1">Client: {inv.clientName}</Text>
      </Card>

      {inv.lineItems?.length ? (
        <Card className="mb-3">
          <CardTitle>Line items</CardTitle>
          {inv.lineItems.map((li: any, i: number) => (
            <View key={i} className="flex-row justify-between py-2 border-b border-border">
              <Text className="flex-1">{li.description}</Text>
              <Text>{formatCurrency(li.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {inv.status !== 'paid' ? (
        <View className="gap-2">
          <Button onPress={sendToClient} loading={busy}>Send to Client</Button>
          <Button variant="outline" onPress={chargeSaved} loading={busy}>Charge Saved Card</Button>
        </View>
      ) : null}
    </PageContainer>
  );
}
