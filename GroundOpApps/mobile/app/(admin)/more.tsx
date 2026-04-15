// Admin "More" menu — exposes every drawer entry from components/admin-layout.tsx.
import React from 'react';
import { Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import {
  Users, Building2, Wrench, FileText, BarChart2, Tag, Package, Mail,
  Headphones, Award, Search, BookOpen, Clock, FlaskConical, ShieldCheck, Archive, LogOut, Calendar, ClipboardList,
} from 'lucide-react-native';

const items = [
  { label: 'Clients', href: '/(admin)/clients', icon: Users },
  { label: 'Subcontractors', href: '/(admin)/subcontractors', icon: Users },
  { label: 'Admin Users', href: '/(admin)/admin-users', icon: ShieldCheck },
  { label: 'Companies', href: '/(admin)/subsidiaries', icon: Building2 },
  { label: 'Companies Permissions', href: '/(admin)/companies-permissions', icon: ShieldCheck },
  { label: 'Locations', href: '/(admin)/locations', icon: Building2 },
  { label: 'Recurring Work Orders', href: '/(admin)/recurring-work-orders', icon: ClipboardList },
  { label: 'Rejected Work Orders', href: '/(admin)/rejected-work-orders', icon: Archive },
  { label: 'Quotes', href: '/(admin)/quotes', icon: FileText },
  { label: 'RFPs', href: '/(admin)/rfps', icon: FileText },
  { label: 'Scheduled Invoices', href: '/(admin)/scheduled-invoices', icon: Calendar },
  { label: 'Categories', href: '/(admin)/categories', icon: Tag },
  { label: 'Assets', href: '/(admin)/assets', icon: Package },
  { label: 'Maintenance Requests', href: '/(admin)/maint-requests', icon: Wrench },
  { label: 'Support Tickets', href: '/(admin)/support-tickets', icon: Headphones },
  { label: 'Email Logs', href: '/(admin)/email-logs', icon: Mail },
  { label: 'Reports', href: '/(admin)/reports', icon: BarChart2 },
  { label: 'Analytics', href: '/(admin)/analytics', icon: BarChart2 },
  { label: 'Contractor Scorecard', href: '/(admin)/contractor-scorecard', icon: Award },
  { label: 'Provider Search', href: '/(admin)/provider-search', icon: Search },
  { label: 'User Activity', href: '/(admin)/user-activity', icon: Users },
  { label: 'Cron Jobs', href: '/(admin)/cron-jobs', icon: Clock },
  { label: 'Sandbox Refresh', href: '/(admin)/sandbox-refresh', icon: FlaskConical },
  { label: 'Resources & API Tokens', href: '/(admin)/resources', icon: BookOpen },
  { label: 'Account Settings', href: '/(admin)/account-settings', icon: ShieldCheck },
];

export default function AdminMore() {
  const router = useRouter();
  const { signOut, userProfile } = useAuth();
  return (
    <PageContainer>
      <PageHeader title="More" subtitle={userProfile?.fullName} />
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
