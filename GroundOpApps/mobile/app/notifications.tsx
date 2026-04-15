import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/utils';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')),
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setItems([]),
    );
    return () => unsub();
  }, [user]);

  const markRead = (id: string) => updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {});

  return (
    <PageContainer scroll={false}>
      <PageHeader title="Notifications" />
      {items.length === 0 ? <EmptyState title="No notifications" /> : (
        <FlashList
          data={items}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card className={`mb-2 ${!item.read ? 'border-l-4 border-l-emphasis' : ''}`} onPress={() => markRead(item.id)}>
              <Text className="font-semibold text-foreground">{item.title}</Text>
              <Text className="text-sm mt-0.5">{item.message}</Text>
              <Text className="text-xs text-muted-foreground mt-1">{formatDateTime(item.createdAt)}</Text>
            </Card>
          )}
        />
      )}
    </PageContainer>
  );
}
