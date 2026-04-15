import React from 'react';
import { View, Text } from 'react-native';
import { cn } from '@/lib/utils';
import { getStatusClasses, getPriorityClasses, humanStatus } from '@/lib/status-utils';

export function Badge({ status, priority, text, className = '' }: {
  status?: string;
  priority?: string;
  text?: string;
  className?: string;
}) {
  const classes = status ? getStatusClasses(status) : priority ? getPriorityClasses(priority) : 'bg-muted text-muted-foreground';
  const label = text ?? humanStatus(status ?? priority);
  return (
    <View className={cn('px-2 py-1 rounded self-start', classes.split(' ')[0], className)}>
      <Text className={cn('text-xs font-semibold', classes.split(' ').slice(1).join(' '))}>{label}</Text>
    </View>
  );
}
