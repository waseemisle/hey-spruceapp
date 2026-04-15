// Deep-link target for Stripe ACH bank-pay flow. Uses a WebView to the existing
// web route `/pay-bank/[id]` so mobile mirrors the exact flow web already supports.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { View } from 'react-native';

export default function PayBank() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const base = process.env.EXPO_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';
  const url = `${base}/pay-bank/${id}`;
  return (
    <View style={{ flex: 1 }}>
      <WebView source={{ uri: url }} />
    </View>
  );
}
