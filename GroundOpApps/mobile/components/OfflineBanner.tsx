import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(!!s.isConnected));
    return () => unsub();
  }, []);
  if (online) return null;
  return (
    <View className="bg-status-red-bg px-4 py-2 flex-row items-center gap-2">
      <WifiOff size={14} color="#991B1B" />
      <Text className="text-status-red-fg text-xs font-semibold">You're offline — changes will sync when you reconnect</Text>
    </View>
  );
}
