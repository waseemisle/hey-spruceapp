import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { loading, userRole } = useAuth();
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-beige">
        <ActivityIndicator />
      </View>
    );
  }
  if (userRole === 'admin') return <Redirect href="/(admin)" />;
  if (userRole === 'client') return <Redirect href="/(client)" />;
  if (userRole === 'subcontractor') return <Redirect href="/(subcontractor)" />;
  return <Redirect href="/(auth)/login" />;
}
