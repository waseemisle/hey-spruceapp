import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Eye, X } from 'lucide-react-native';
import { getImpersonationState, setImpersonationState, ImpersonationState } from '@/lib/impersonation';
import { useRouter } from 'expo-router';

export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const router = useRouter();

  useEffect(() => {
    getImpersonationState().then(setState);
  }, []);

  if (!state?.isImpersonating) return null;

  const exit = async () => {
    await setImpersonationState(null);
    router.replace('/(admin)');
  };

  return (
    <View className="bg-brand flex-row items-center justify-between px-4 py-2">
      <View className="flex-row items-center flex-1">
        <Eye size={16} color="#fff" />
        <Text className="text-white font-semibold ml-2" numberOfLines={1}>
          Viewing as {state.targetName || state.targetUid} ({state.targetRole})
        </Text>
      </View>
      <Pressable onPress={exit} className="flex-row items-center bg-white/20 px-3 py-1 rounded">
        <X size={14} color="#fff" />
        <Text className="text-white text-xs ml-1 font-semibold">Exit</Text>
      </Pressable>
    </View>
  );
}
