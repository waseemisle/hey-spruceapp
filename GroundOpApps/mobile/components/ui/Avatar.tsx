import React from 'react';
import { View, Text, Image } from 'react-native';
import { initialsFromName } from '@/lib/utils';

export function Avatar({ name = '', uri, size = 40 }: { name?: string; uri?: string; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      className="bg-navy items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="text-white font-semibold" style={{ fontSize: size * 0.4 }}>
        {initialsFromName(name)}
      </Text>
    </View>
  );
}
