import '../global.css';
import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { Toaster } from 'sonner-native';
import { View } from 'react-native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { OfflineBanner } from '@/components/OfflineBanner';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function RoleGate({ children }: { children: React.ReactNode }) {
  const { user, userRole, userProfile, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const group = segments[0] as string | undefined;
    const inAuth = group === '(auth)';
    const inAdmin = group === '(admin)';
    const inClient = group === '(client)';
    const inSub = group === '(subcontractor)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }
    if (userProfile?._pending) {
      router.replace('/(auth)/login');
      return;
    }
    if (userRole === 'admin' && !inAdmin) router.replace('/(admin)');
    else if (userRole === 'client' && !inClient) router.replace('/(client)');
    else if (userRole === 'subcontractor' && !inSub) router.replace('/(subcontractor)');
    else if (userRole === null && !inAuth) router.replace('/(auth)/login');
  }, [user, userRole, userProfile, loading, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}>
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <View style={{ flex: 1 }}>
              <StatusBar style="dark" />
              <OfflineBanner />
              <RoleGate>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(admin)" />
                  <Stack.Screen name="(client)" />
                  <Stack.Screen name="(subcontractor)" />
                </Stack>
              </RoleGate>
              <Toaster />
            </View>
          </AuthProvider>
        </QueryClientProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
