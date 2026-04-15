// Placeholder for screens that have the spec locked in but are not yet implemented.
// Pattern: follow the web equivalent + the section of MOBILE_APP_BUILD_PROMPT.md noted below.
import React from 'react';
import { Text } from 'react-native';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Construction } from 'lucide-react-native';
import { EmptyState } from '@/components/ui/EmptyState';

export function StubScreen({
  title,
  webPath,
  spec,
}: {
  title: string;
  webPath: string;
  spec: string;
}) {
  return (
    <PageContainer>
      <PageHeader title={title} subtitle="Scaffolded — pending implementation" />
      <Card>
        <CardTitle>How to complete this screen</CardTitle>
        <Text className="mt-2 text-sm text-foreground">
          Mirror the web equivalent at <Text className="font-semibold">{webPath}</Text> using the
          patterns established in the reference screens. Follow the spec in{'\n'}
          <Text className="font-semibold">MOBILE_APP_BUILD_PROMPT.md — {spec}</Text>.
        </Text>
        <Text className="mt-3 text-xs text-muted-foreground">
          Use Firestore onSnapshot for realtime, the shared UI primitives in
          components/ui, and the existing /api routes via lib/api. Do not weaken
          Firestore rules. Any email/SMS/notification side-effects must be
          fire-and-forget (no awaited blocking on the UI thread).
        </Text>
      </Card>
      <EmptyState icon={<Construction size={40} color="#D97706" />} title={title} description="Implementation scaffold — ready for you to fill in." />
    </PageContainer>
  );
}
