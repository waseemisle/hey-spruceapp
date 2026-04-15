import React from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/utils';

export function Skeleton({ className = '' }: { className?: string }) {
  return <View className={cn('bg-muted rounded animate-pulse', className)} />;
}
