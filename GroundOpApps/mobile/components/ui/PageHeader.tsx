import React from 'react';
import { View, Text } from 'react-native';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between mb-4">
      <View className="flex-1">
        <Text className="text-2xl font-bold text-foreground">{title}</Text>
        {subtitle ? <Text className="text-sm text-muted-foreground mt-1">{subtitle}</Text> : null}
      </View>
      {actions ? <View className="ml-2 flex-row gap-2">{actions}</View> : null}
    </View>
  );
}
