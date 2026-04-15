import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { cn } from '@/lib/utils';

export function Card({
  children,
  onPress,
  className = '',
}: {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const inner = (
    <View className={cn('bg-card rounded-lg border border-border p-4', className)}>
      {children}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{inner}</Pressable>;
  return inner;
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <View className="mb-3">{children}</View>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text className="text-lg font-semibold text-foreground">{children as any}</Text>;
}

export function CardDescription({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm text-muted-foreground mt-1">{children as any}</Text>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={className}>{children}</View>;
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return <View className="mt-4 pt-4 border-t border-border flex-row justify-end gap-2">{children}</View>;
}
