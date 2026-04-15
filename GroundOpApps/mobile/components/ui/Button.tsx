import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  leftIcon,
  rightIcon,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}) {
  const base = 'flex-row items-center justify-center rounded-lg';
  const sizes: Record<Size, string> = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-5 py-4',
  };
  const variants: Record<Variant, { bg: string; text: string }> = {
    primary: { bg: 'bg-navy', text: 'text-white' },
    secondary: { bg: 'bg-secondary', text: 'text-secondary-foreground' },
    outline: { bg: 'bg-transparent border border-border', text: 'text-foreground' },
    ghost: { bg: 'bg-transparent', text: 'text-foreground' },
    destructive: { bg: 'bg-destructive', text: 'text-destructive-foreground' },
  };
  const v = variants[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      className={cn(base, sizes[size], v.bg, isDisabled && 'opacity-50', className)}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' || variant === 'destructive' ? '#fff' : '#1A2635'} />
      ) : (
        <>
          {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
          <Text className={cn('font-semibold text-base', v.text)}>{children as any}</Text>
          {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}
