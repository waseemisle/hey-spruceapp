import React, { useState } from 'react';
import { Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Check your email', 'A password reset link has been sent.');
      router.replace('/(auth)/login');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Forgot password" subtitle="Enter your email and we'll send a reset link." />
      <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Button onPress={submit} loading={loading}>Send reset email</Button>
      <Text className="text-xs text-center text-muted-foreground mt-3">
        The reset link opens this app via a deep link and takes you back to sign in.
      </Text>
    </PageContainer>
  );
}
