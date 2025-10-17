'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

export default function PortalLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check which portal the user belongs to
      // Check admin
      const adminDoc = await getDoc(doc(db, 'adminUsers', user.uid));
      if (adminDoc.exists()) {
        toast({
          title: 'Login Successful',
          description: 'Welcome to Admin Portal',
        });
        router.push('/admin-portal');
        return;
      }

      // Check client
      const clientDoc = await getDoc(doc(db, 'clients', user.uid));
      if (clientDoc.exists()) {
        const clientData = clientDoc.data();
        if (clientData.status === 'approved') {
          toast({
            title: 'Login Successful',
            description: 'Welcome to Client Portal',
          });
          router.push('/client-portal');
          return;
        } else {
          toast({
            title: 'Account Pending',
            description: 'Your account is pending admin approval. Please check back later.',
            variant: 'destructive',
          });
          await auth.signOut();
          setLoading(false);
          return;
        }
      }

      // Check subcontractor
      const subDoc = await getDoc(doc(db, 'subcontractors', user.uid));
      if (subDoc.exists()) {
        const subData = subDoc.data();
        if (subData.status === 'approved') {
          toast({
            title: 'Login Successful',
            description: 'Welcome to Subcontractor Portal',
          });
          router.push('/subcontractor-portal');
          return;
        } else {
          toast({
            title: 'Account Pending',
            description: 'Your account is pending admin approval. Please check back later.',
            variant: 'destructive',
          });
          await auth.signOut();
          setLoading(false);
          return;
        }
      }

      // No profile found
      toast({
        title: 'Error',
        description: 'No account profile found. Please contact support.',
        variant: 'destructive',
      });
      await auth.signOut();
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        title: 'Login Failed',
        description: error.message || 'Invalid email or password',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-violet-600 to-purple-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">Portal Login</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your portal
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="text-sm text-right">
              <Link href="/forgot-password" className="text-purple-600 hover:underline">
                Forgot password?
              </Link>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
            <div className="text-sm text-center text-gray-600">
              Don't have an account?{' '}
              <Link href="/register-client" className="text-purple-600 hover:underline">
                Register as Client
              </Link>
              {' or '}
              <Link href="/register-subcontractor" className="text-purple-600 hover:underline">
                Subcontractor
              </Link>
            </div>
            <Link href="/" className="text-sm text-center text-gray-600 hover:underline">
              ← Back to Home
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
