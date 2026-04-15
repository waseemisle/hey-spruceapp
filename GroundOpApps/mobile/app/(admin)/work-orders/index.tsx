import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FilterPills } from '@/components/ui/FilterPills';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';

type Filter = 'all' | 'pending' | 'approved' | 'assigned' | 'completed' | 'archived';

export default function AdminWorkOrders() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'workOrders'), (s) =>
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return items
      .filter((x) => filter === 'all' || x.status === filter)
      .filter((x) =>
        !t ||
        x.workOrderNumber?.toLowerCase().includes(t) ||
        x.title?.toLowerCase().includes(t) ||
        x.clientName?.toLowerCase().includes(t),
      )
      .sort((a, b) => (b.createdAt?.toDate?.()?.getTime?.() ?? 0) - (a.createdAt?.toDate?.()?.getTime?.() ?? 0));
  }, [items, search, filter]);

  return (
    <PageContainer scroll={false}>
      <PageHeader title="Work Orders" subtitle={`${items.length} total`} />
      <Input placeholder="Search by WO#, title, client…" value={search} onChangeText={setSearch} />
      <FilterPills<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'assigned', label: 'Assigned' },
          { value: 'completed', label: 'Completed' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      {filtered.length === 0 ? <EmptyState /> : (
        <FlashList
          data={filtered}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/(admin)/work-orders/${item.id}` as any)} className="mb-2">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-2">
                  <CardTitle>{item.workOrderNumber || item.id.slice(0, 8)}</CardTitle>
                  <Text className="text-sm text-foreground mt-0.5" numberOfLines={1}>{item.title}</Text>
                  <Text className="text-xs text-muted-foreground mt-1">{item.clientName} · {item.location?.locationName}</Text>
                </View>
                <Badge status={item.status} />
              </View>
              <Text className="text-xs text-muted-foreground mt-2">{formatDate(item.createdAt)}</Text>
            </Card>
          )}
        />
      )}
    </PageContainer>
  );
}
