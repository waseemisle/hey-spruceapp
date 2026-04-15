import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Home, ClipboardList, CheckSquare, MessageSquare, Menu } from 'lucide-react-native';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

export default function SubTabs() {
  return (
    <View style={{ flex: 1 }}>
      <ImpersonationBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#0D1520',
          tabBarInactiveTintColor: '#8A9CAB',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }} />
        <Tabs.Screen name="bidding" options={{ title: 'Bidding', tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} /> }} />
        <Tabs.Screen name="assigned" options={{ title: 'Assigned', tabBarIcon: ({ color, size }) => <CheckSquare size={size} color={color} /> }} />
        <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: ({ color, size }) => <MessageSquare size={size} color={color} /> }} />
        <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Menu size={size} color={color} /> }} />
        <Tabs.Screen name="quotes" options={{ href: null }} />
        <Tabs.Screen name="completed-jobs" options={{ href: null }} />
        <Tabs.Screen name="support-tickets" options={{ href: null }} />
        <Tabs.Screen name="account-settings" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
