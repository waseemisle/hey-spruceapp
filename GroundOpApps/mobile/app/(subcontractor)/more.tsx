import React from 'react';
import { Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { FileText, ClipboardCheck, Headphones, LogOut, ShieldCheck } from 'lucide-react-native';

export default function SubMore() {
  const router = useRouter();
  const { signOut, userProfile } = useAuth();
  const items = [
    { label: 'My Quotes', href: '/(subcontractor)/quotes', icon: FileText },
    { label: 'Completed Jobs', href: '/(subcontractor)/completed-jobs', icon: ClipboardCheck },
    { label: 'Support Tickets', href: '/(subcontractor)/support-tickets', icon: Headphones },
    { label: 'Account Settings (Bank)', href: '/(subcontractor)/account-settings', icon: ShieldCheck },
  ];
  return (
    <PageContainer>
      <PageHeader title="More" subtitle={userProfile?.businessName || userProfile?.fullName} />
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
