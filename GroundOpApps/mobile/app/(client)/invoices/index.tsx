import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ClientInvoicesList() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'invoices'), where('clientId', '==', user.uid)),
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, [user]);

  return (
    <PageContainer scroll={false}>
      <PageHeader title="Invoices" />
      {items.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        <FlashList
          data={items}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/(client)/invoices/${item.id}` as any)} className="mb-2">
              <View className="flex-row items-center justify-between">
                <CardTitle>{item.invoiceNumber}</CardTitle>
                <Badge status={item.status} />
              </View>
              <Text className="text-lg font-bold text-foreground mt-2">{formatCurrency(item.totalAmount)}</Text>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs text-muted-foreground">{item.workOrderNumber}</Text>
                <Text className="text-xs text-muted-foreground">Due {formatDate(item.dueDate)}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </PageContainer>
  );
}
