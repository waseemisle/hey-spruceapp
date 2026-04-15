import React from 'react';
import { Image, View, Text } from 'react-native';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <View className="flex-row items-center gap-2">
      <Image
        source={{ uri: 'https://www.groundops.co/deck/logo.png' }}
        style={{ width: size, height: size, borderRadius: 4 }}
        resizeMode="contain"
      />
      <Text className="font-bold text-lg text-navy tracking-wide">GroundOps</Text>
    </View>
  );
}
