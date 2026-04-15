import React, { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false),
    );
    const unsub = onSnapshot(q, (snap) => setCount(snap.size), () => setCount(0));
    return () => unsub();
  }, [user]);

  return (
    <Pressable
      onPress={() => router.push('/notifications' as any)}
      className="relative p-2"
      accessibilityRole="button"
      accessibilityLabel={`Notifications${count ? `, ${count} unread` : ''}`}
    >
      <Bell size={22} color="#1A2635" />
      {count > 0 ? (
        <View className="absolute top-0 right-0 bg-destructive rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
          <Text className="text-white text-[10px] font-bold">{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
