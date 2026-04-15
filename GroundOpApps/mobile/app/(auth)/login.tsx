import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, Alert } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { toast } from 'sonner-native';
import { PageContainer } from '@/components/ui/PageContainer';
import { Logo } from '@/components/ui/Logo';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';

export default function LoginScreen() {
  const { signIn, userProfile } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // Role gate in root layout handles redirect.
      setTimeout(() => {
        if (userProfile?._pending) {
          Alert.alert(
            'Awaiting Approval',
            'Your account is pending admin approval. You will receive an email once approved.',
          );
        }
      }, 300);
    } catch (e: any) {
      setErr(e.message || 'Sign in failed');
      toast.error('Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer scroll={false} className="flex-1 justify-center">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="items-center mb-6">
          <Logo size={48} />
          <Text className="text-muted-foreground mt-3 text-sm">Facility Maintenance Infrastructure</Text>
        </View>

        <View className="bg-card rounded-lg border border-border p-5 mx-2">
          <Text className="text-xl font-bold mb-4 text-foreground">Sign in</Text>
          <Input
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
          />
          <Input
            label="Password"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          {err ? <Text className="text-destructive text-xs mb-2">{err}</Text> : null}
          <Button onPress={submit} loading={loading}>Sign in</Button>

          <View className="flex-row justify-between mt-4">
            <Link href="/(auth)/forgot-password" asChild>
              <Pressable><Text className="text-xs text-emphasis">Forgot password?</Text></Pressable>
            </Link>
            <Link href="/(auth)/register-client" asChild>
              <Pressable><Text className="text-xs text-emphasis font-semibold">Register as client</Text></Pressable>
            </Link>
          </View>
          <View className="flex-row justify-end mt-2">
            <Link href="/(auth)/register-subcontractor" asChild>
              <Pressable><Text className="text-xs text-emphasis">Register as subcontractor</Text></Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </PageContainer>
  );
}
