'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const checkUserExists = async (email: string) => {
    try {
      // Check all collections for the email
      const collections = ['users', 'clients', 'adminUsers', 'subcontractors'];
      
      for (const collectionName of collections) {
        const q = query(collection(db, collectionName), where('email', '==', email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          return { exists: true, collection: collectionName };
        }
      }
      
      return { exists: false, collection: null };
    } catch (error) {
      console.error('Error checking user existence:', error);
      throw error;
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First, check if user exists in any collection
      const userCheck = await checkUserExists(email);
      
      if (!userCheck.exists) {
        console.log("User not Found!, Please register first");
        toast({
          title: 'User not Found!',
          description: 'Please Register First',
          className: 'bg-[#e06e6e] text-white border-[#e06e6e]',
        });
        setLoading(false);
        return;
      }

      // User exists, proceed with password reset
      await sendPasswordResetEmail(auth, email);
      setEmailSent(true);
      toast({
        title: 'Reset Email Sent',
        description: 'Please check your email for password reset instructions.',
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      // Handle specific Firebase auth errors
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address. Please register first.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'Reset Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-600">Check Your Email</CardTitle>
            <CardDescription>
              We've sent password reset instructions to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600 text-center">
              <p>If you don't see the email in your inbox, please check your spam folder.</p>
              <p className="mt-2">The reset link will expire in 1 hour.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              onClick={() => {
                setEmailSent(false);
                setEmail('');
              }}
              variant="outline"
              className="w-full"
            >
              Send Another Email
            </Button>
            <Link href="/portal-login" className="text-sm text-center text-gray-600 hover:underline">
              ← Back to Login
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">Reset Password</CardTitle>
          <CardDescription className="text-center">
            Enter your email address and we'll send you a link to reset your password
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleResetPassword}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {loading ? 'Sending...' : 'Send Reset Email'}
            </Button>
            <div className="text-sm text-center text-gray-600">
              Remember your password?{' '}
              <Link href="/portal-login" className="text-blue-500 hover:underline">
                Back to Login
              </Link>
            </div>
            <div className="text-sm text-center text-gray-600">
              Don't have an account?{' '}
              <Link href="/register-client" className="text-blue-500 hover:underline">
                Register as Client
              </Link>
              {' or '}
              <Link href="/register-subcontractor" className="text-blue-500 hover:underline">
                Subcontractor
              </Link>
            </div>
            <Link href="/" className="text-sm text-center text-gray-600 hover:underline flex items-center justify-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
