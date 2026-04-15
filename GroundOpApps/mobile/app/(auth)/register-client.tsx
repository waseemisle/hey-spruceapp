import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { normalizePhone } from '@/lib/utils';

export default function RegisterClient() {
  const { signUp, signOut } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    email: '', password: '', fullName: '', companyName: '', phone: '',
  });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.email || !form.password || !form.fullName) {
      Alert.alert('Missing fields', 'Email, password, and full name are required.');
      return;
    }
    setLoading(true);
    try {
      const user = await signUp(form.email, form.password);
      await setDoc(doc(db, 'clients', user.uid), {
        uid: user.uid,
        email: form.email.trim(),
        fullName: form.fullName,
        companyName: form.companyName,
        phone: normalizePhone(form.phone),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await signOut();
      Alert.alert(
        'Registration received',
        'Your account is pending admin approval. You will be notified by email once approved.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <PageContainer>
      <PageHeader title="Register as Client" subtitle="Your registration is reviewed by an admin before approval." />
      <Input label="Full Name" value={form.fullName} onChangeText={(v) => update('fullName', v)} />
      <Input label="Company Name" value={form.companyName} onChangeText={(v) => update('companyName', v)} />
      <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => update('email', v)} />
      <Input label="Phone" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => update('phone', v)} />
      <Input label="Password" secureTextEntry value={form.password} onChangeText={(v) => update('password', v)} />
      <Button onPress={submit} loading={loading}>Submit for approval</Button>
      <Text className="text-xs text-muted-foreground mt-3 text-center">
        After approval, an admin will assign your locations before you can sign in.
      </Text>
    </PageContainer>
  );
}
