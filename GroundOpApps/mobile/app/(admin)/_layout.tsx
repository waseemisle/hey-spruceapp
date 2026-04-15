import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Home, ClipboardList, Receipt, MessageSquare, Menu } from 'lucide-react-native';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

export default function AdminTabs() {
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
        <Tabs.Screen name="invoices" options={{ title: 'Invoices', tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} /> }} />
        <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: ({ color, size }) => <MessageSquare size={size} color={color} /> }} />
        <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Menu size={size} color={color} /> }} />
        {/* Hide dynamic routes from tab bar */}
        <Tabs.Screen name="quotes" options={{ href: null }} />
        <Tabs.Screen name="clients" options={{ href: null }} />
        <Tabs.Screen name="subcontractors" options={{ href: null }} />
        <Tabs.Screen name="locations" options={{ href: null }} />
        <Tabs.Screen name="recurring-work-orders" options={{ href: null }} />
        <Tabs.Screen name="support-tickets" options={{ href: null }} />
        <Tabs.Screen name="reports" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="categories" options={{ href: null }} />
        <Tabs.Screen name="assets" options={{ href: null }} />
        <Tabs.Screen name="maint-requests" options={{ href: null }} />
        <Tabs.Screen name="admin-users" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
