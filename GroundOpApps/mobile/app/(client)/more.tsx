// Client "More" menu — matches tabs 5-10 of client-layout.tsx plus settings.
// Permission flags (hasRecurringWorkOrdersPermission, hasViewSubcontractorsPermission,
// hasMaintenancePermission) on the client profile control visibility — see §C.21.
import React from 'react';
import { Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import {
  Building2, RotateCcw, Users, Wrench, CreditCard, MessageSquare, Headphones, LogOut, ShieldCheck,
} from 'lucide-react-native';

export default function ClientMore() {
  const router = useRouter();
  const { signOut, userProfile } = useAuth();

  const items = [
    { label: 'Locations', href: '/(client)/locations', icon: Building2, show: true },
    { label: 'Subsidiaries', href: '/(client)/subsidiaries', icon: Building2, show: true },
    { label: 'Recurring Work Orders', href: '/(client)/recurring-work-orders', icon: RotateCcw, show: userProfile?.hasRecurringWorkOrdersPermission !== false },
    { label: 'Subcontractors', href: '/(client)/subcontractors', icon: Users, show: !!userProfile?.hasViewSubcontractorsPermission },
    { label: 'Maintenance Requests', href: '/(client)/maintenance-requests', icon: Wrench, show: !!userProfile?.hasMaintenancePermission },
    { label: 'Payment Methods', href: '/(client)/payment-methods', icon: CreditCard, show: true },
    { label: 'Messages', href: '/(client)/messages', icon: MessageSquare, show: true },
    { label: 'Support Tickets', href: '/(client)/support-tickets', icon: Headphones, show: true },
    { label: 'Account Settings', href: '/(client)/account-settings', icon: ShieldCheck, show: true },
  ].filter((i) => i.show);

  return (
    <PageContainer>
      <PageHeader title="More" subtitle={userProfile?.companyName || userProfile?.fullName} />
      {items.map((it) => (
        <Pressable key={it.href} onPress={() => router.push(it.href as any)}>
          <Card className="mb-2 flex-row items-center">
            <it.icon size={18} color="#1A2635" />
            <Text className="ml-3 font-semibold">{it.label}</Text>
          </Card>
        </Pressable>
      ))}
      <Button variant="destructive" className="mt-3" onPress={signOut} leftIcon={<LogOut size={16} color="#fff" />}>
        Sign out
      </Button>
    </PageContainer>
  );
}
