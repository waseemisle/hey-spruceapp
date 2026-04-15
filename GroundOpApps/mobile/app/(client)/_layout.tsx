import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Home, ClipboardList, FileText, Receipt, MessageSquare, Menu } from 'lucide-react-native';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

export default function ClientTabs() {
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
        <Tabs.Screen name="work-orders" options={{ title: 'Work Orders', tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} /> }} />
        <Tabs.Screen name="quotes" options={{ title: 'Quotes', tabBarIcon: ({ color, size }) => <FileText size={size} color={color} /> }} />
        <Tabs.Screen name="invoices" options={{ title: 'Invoices', tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} /> }} />
        <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Menu size={size} color={color} /> }} />
        <Tabs.Screen name="locations" options={{ href: null }} />
        <Tabs.Screen name="subsidiaries" options={{ href: null }} />
        <Tabs.Screen name="recurring-work-orders" options={{ href: null }} />
        <Tabs.Screen name="support-tickets" options={{ href: null }} />
        <Tabs.Screen name="messages" options={{ href: null }} />
        <Tabs.Screen name="payment-methods" options={{ href: null }} />
        <Tabs.Screen name="maintenance-requests" options={{ href: null }} />
        <Tabs.Screen name="account-settings" options={{ href: null }} />
        <Tabs.Screen name="subcontractors" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
