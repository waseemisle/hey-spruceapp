import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function AdminInvoices() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'invoices'), (s) =>
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, []);
  return (
    <PageContainer scroll={false}>
      <PageHeader title="Invoices" subtitle={`${items.length} total`} />
      {items.length === 0 ? <EmptyState /> : (
        <FlashList
          data={items}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/(admin)/invoices/${item.id}` as any)} className="mb-2">
              <View className="flex-row justify-between items-center">
                <CardTitle>{item.invoiceNumber}</CardTitle>
                <Badge status={item.status} />
              </View>
              <Text className="text-xs text-muted-foreground mt-1">{item.clientName} · {item.workOrderNumber}</Text>
              <View className="flex-row justify-between mt-2">
                <Text className="text-lg font-bold">{formatCurrency(item.totalAmount)}</Text>
                <Text className="text-xs text-muted-foreground">Due {formatDate(item.dueDate)}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </PageContainer>
  );
}
