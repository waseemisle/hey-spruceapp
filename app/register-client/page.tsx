'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from '@/lib/firebase-auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { AuthShell } from '@/components/ui/auth-shell';
import { UserPlus } from 'lucide-react';

export default function RegisterClient() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = userCredential.user;

      // Create client document in Firestore
      await setDoc(doc(db, 'clients', user.uid), {
        uid: user.uid,
        email: formData.email,
        fullName: formData.fullName,
        phone: formData.phone,
        password: formData.password,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create user document
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        email: formData.email,
        fullName: formData.fullName,
        role: 'client',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Registration successful! Your account is pending admin approval.');

      // Sign out and redirect to login
      await auth.signOut();
      setTimeout(() => {
        router.push('/portal-login');
      }, 2000);
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Client Registration"
      subtitle="Create your client account to manage cleaning and maintenance."
      icon={UserPlus}
    >
      <Card className="w-full rounded-xl border-border/80 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">Client Registration</CardTitle>
          <CardDescription className="text-center">
            Create your client account to manage your service requests
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="John Doe"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@company.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              loading={loading} disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Register'}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link href="/portal-login" className="text-primary underline-offset-4 hover:underline">
                Login here
              </Link>
            </div>
            <Link href="/" className="text-sm text-center text-muted-foreground hover:underline">
              ← Back to Home
            </Link>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  );
}
