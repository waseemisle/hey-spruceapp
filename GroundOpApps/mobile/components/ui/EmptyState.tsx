import React from 'react';
import { View, Text } from 'react-native';
import { Inbox } from 'lucide-react-native';

export function EmptyState({
  title = 'Nothing here yet',
  description,
  icon,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <View className="items-center py-10 px-6">
      <View className="mb-3">{icon ?? <Inbox size={40} color="#8A9CAB" />}</View>
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {description ? (
        <Text className="text-sm text-muted-foreground mt-1 text-center">{description}</Text>
      ) : null}
    </View>
  );
}
