import React from 'react';
import { SafeAreaView, ScrollView, View, RefreshControl } from 'react-native';
import { cn } from '@/lib/utils';

export function PageContainer({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  className = '',
}: {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}) {
  const content = <View className={cn('p-4', className)}>{children}</View>;
  return (
    <SafeAreaView className="flex-1 bg-beige">
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
