import React from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { cn } from '@/lib/utils';

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={cn(
              'px-3 py-2 rounded-full mr-2',
              active ? 'bg-navy' : 'bg-secondary',
            )}
          >
            <Text className={cn('text-xs font-semibold', active ? 'text-white' : 'text-secondary-foreground')}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
