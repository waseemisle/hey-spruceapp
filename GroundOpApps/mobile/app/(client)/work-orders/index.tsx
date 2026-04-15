import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';

type Filter = 'all' | 'pending' | 'in-progress' | 'completed';

export default function ClientWorkOrdersList() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'workOrders'), where('clientId', '==', user.uid)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => {
    const byFilter = (x: any) =>
      filter === 'all' ? true :
      filter === 'in-progress' ? ['assigned', 'in-progress'].includes(x.status) :
      x.status === filter;
    return items.filter(byFilter).sort((a, b) => {
      const at = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bt = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return bt - at;
    });
  }, [items, filter]);

  return (
    <PageContainer scroll={false}>
      <PageHeader
        title="Work Orders"
        actions={
          <Pressable
            onPress={() => router.push('/(client)/work-orders/create')}
            className="bg-navy rounded-lg px-3 py-2 flex-row items-center"
          >
            <Plus size={14} color="#fff" />
            <Text className="text-white text-xs font-semibold ml-1">New</Text>
          </Pressable>
        }
      />
      <FilterPills<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'in-progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' },
        ]}
      />
      {filtered.length === 0 ? (
        <EmptyState title="No work orders" description="Tap 'New' to create your first service request." />
      ) : (
        <FlashList
          data={filtered}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card
              onPress={() => router.push(`/(client)/work-orders/${item.id}` as any)}
              className="mb-2"
            >
              <View className="flex-row items-start justify-between mb-1">
                <View className="flex-1 mr-2">
                  <CardTitle>{item.workOrderNumber || item.id.slice(0, 8)}</CardTitle>
                  <Text className="text-sm text-foreground mt-0.5" numberOfLines={1}>{item.title}</Text>
                </View>
                <Badge status={item.status} />
              </View>
              <View className="flex-row items-center justify-between mt-1">
                <Text className="text-xs text-muted-foreground">{item.location?.locationName}</Text>
                <Text className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </PageContainer>
  );
}
