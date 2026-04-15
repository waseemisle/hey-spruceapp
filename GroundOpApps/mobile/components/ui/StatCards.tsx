import React from 'react';
import { View, Text } from 'react-native';

export function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'red' | 'green' | 'blue' | 'yellow';
}) {
  const toneMap: Record<string, string> = {
    default: 'text-foreground',
    red: 'text-status-red-fg',
    green: 'text-status-green-fg',
    blue: 'text-status-blue-fg',
    yellow: 'text-status-yellow-fg',
  };
  return (
    <View className="flex-1 bg-card border border-border rounded-lg p-3">
      <Text className="text-xs text-muted-foreground mb-1">{label}</Text>
      <Text className={`text-2xl font-bold ${toneMap[tone]}`}>{value}</Text>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-2 mb-4">{children}</View>;
}
