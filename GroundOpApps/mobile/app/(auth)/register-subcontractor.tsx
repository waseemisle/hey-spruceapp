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

export default function RegisterSub() {
  const { signUp, signOut } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    email: '', password: '', fullName: '', businessName: '', phone: '', skills: '', licenseNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.email || !form.password || !form.fullName || !form.businessName) {
      Alert.alert('Missing fields', 'Please fill all required fields.');
      return;
    }
    setLoading(true);
    try {
      const user = await signUp(form.email, form.password);
      await setDoc(doc(db, 'subcontractors', user.uid), {
        uid: user.uid,
        email: form.email.trim(),
        fullName: form.fullName,
        businessName: form.businessName,
        phone: normalizePhone(form.phone),
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        licenseNumber: form.licenseNumber,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await signOut();
      Alert.alert(
        'Registration received',
        'Your account is pending admin approval. You will receive an email once approved.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Register as Subcontractor" />
      <Input label="Full Name" value={form.fullName} onChangeText={(v) => update('fullName', v)} />
      <Input label="Business Name" value={form.businessName} onChangeText={(v) => update('businessName', v)} />
      <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => update('email', v)} />
      <Input label="Phone" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => update('phone', v)} />
      <Input label="Skills (comma-separated)" value={form.skills} onChangeText={(v) => update('skills', v)} placeholder="Electrical, HVAC, Plumbing" />
      <Input label="License Number (optional)" value={form.licenseNumber} onChangeText={(v) => update('licenseNumber', v)} />
      <Input label="Password" secureTextEntry value={form.password} onChangeText={(v) => update('password', v)} />
      <Button onPress={submit} loading={loading}>Submit for approval</Button>
    </PageContainer>
  );
}
