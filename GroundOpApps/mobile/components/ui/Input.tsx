import React, { forwardRef } from 'react';
import { TextInput, View, Text, TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  containerClassName?: string;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, containerClassName = '', className = '', ...rest },
  ref,
) {
  return (
    <View className={cn('mb-3', containerClassName)}>
      {label ? <Text className="text-sm font-semibold text-foreground mb-1">{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor="#8A9CAB"
        className={cn(
          'bg-white border border-border rounded-lg px-4 py-3 text-base text-foreground',
          error ? 'border-destructive' : '',
          className as any,
        )}
        {...rest}
      />
      {error ? <Text className="text-xs text-destructive mt-1">{error}</Text> : null}
    </View>
  );
});

export function Textarea({ label, error, numberOfLines = 4, ...rest }: Props & { numberOfLines?: number }) {
  return (
    <View className="mb-3">
      {label ? <Text className="text-sm font-semibold text-foreground mb-1">{label}</Text> : null}
      <TextInput
        multiline
        numberOfLines={numberOfLines}
        textAlignVertical="top"
        placeholderTextColor="#8A9CAB"
        className={cn(
          'bg-white border border-border rounded-lg px-4 py-3 text-base text-foreground min-h-[96px]',
          error ? 'border-destructive' : '',
        )}
        {...rest}
      />
      {error ? <Text className="text-xs text-destructive mt-1">{error}</Text> : null}
    </View>
  );
}
