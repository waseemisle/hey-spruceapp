// Invoice detail + Stripe PaymentSheet (same Stripe account as web).
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useStripe } from '@stripe/stripe-react-native';
import { toast } from 'sonner-native';
import { db } from '@/lib/firebase';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api';

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inv, setInv] = useState<any>(null);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'invoices', id as string), (s) => {
      if (s.exists()) setInv({ id: s.id, ...s.data() });
    });
    return () => unsub();
  }, [id]);

  const payWithCard = async () => {
    if (!inv) return;
    setPaying(true);
    try {
      // Reuse existing web API: creates Stripe payment link. For native PaymentSheet,
      // you can also add a new /api/stripe/mobile-payment-intent route that returns
      // a PaymentIntent client secret + ephemeral key. This reference opens the link.
      const res = await api.post<{ url: string }>('/api/stripe/create-payment-link', { invoiceId: inv.id });
      if (res?.url) await Linking.openURL(res.url);
    } catch (e: any) {
      Alert.alert('Payment error', e.message);
    } finally {
      setPaying(false);
    }
  };

  const payWithACH = async () => {
    if (!inv) return;
    const base = process.env.EXPO_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';
    await Linking.openURL(`${base}/pay-bank/${inv.id}`);
  };

  if (!inv) return <PageContainer><Text>Loading…</Text></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title={inv.invoiceNumber} subtitle={inv.workOrderNumber} />
      <Badge status={inv.status} />

      <Card className="mt-3 mb-3">
        <Text className="text-sm text-muted-foreground">Amount due</Text>
        <Text className="text-3xl font-bold text-foreground">{formatCurrency(inv.totalAmount)}</Text>
        <Text className="text-xs text-muted-foreground mt-2">Due {formatDate(inv.dueDate)}</Text>
      </Card>

      {inv.lineItems?.length ? (
        <Card className="mb-3">
          <CardTitle>Line items</CardTitle>
          {inv.lineItems.map((li: any, i: number) => (
            <View key={i} className="flex-row justify-between py-2 border-b border-border">
              <View className="flex-1"><Text>{li.description}</Text><Text className="text-xs text-muted-foreground">Qty {li.quantity}</Text></View>
              <Text>{formatCurrency(li.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {inv.status !== 'paid' ? (
        <View className="gap-2">
          <Button onPress={payWithCard} loading={paying}>Pay by Card</Button>
          <Button variant="outline" onPress={payWithACH}>Pay by Bank (ACH)</Button>
        </View>
      ) : (
        <Text className="text-center text-status-green-fg font-semibold py-4">Paid · {formatDate(inv.paidAt)}</Text>
      )}
    </PageContainer>
  );
}
