'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { AuthShell } from '@/components/ui/auth-shell';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const verifyResetCode = async () => {
      const oobCode = searchParams.get('oobCode');

      if (!oobCode) {
        setError('Invalid reset link. Please request a new password reset.');
        setVerifying(false);
        return;
      }

      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        setUserEmail(email);
        setVerified(true);
      } catch (error: any) {
        console.error('Code verification error:', error);
        let errorMessage = 'Invalid or expired reset link.';
        
        if (error.code === 'auth/invalid-action-code') {
          errorMessage = 'Invalid reset link. Please request a new password reset.';
        } else if (error.code === 'auth/expired-action-code') {
          errorMessage = 'Reset link has expired. Please request a new password reset.';
        }
        
        setError(errorMessage);
      } finally {
        setVerifying(false);
      }
    };

    verifyResetCode();
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: 'Passwords Do Not Match',
        description: 'Please make sure both passwords are identical.',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'Password Too Short',
        description: 'Password must be at least 6 characters long.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const oobCode = searchParams.get('oobCode');

    try {
      await confirmPasswordReset(auth, oobCode!, password);

      // Sync new password to Firestore for admin visibility
      try {
        await fetch('/api/auth/sync-reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, newPassword: password }),
        });
      } catch {
        // Non-critical — auth reset already succeeded
      }

      setSuccess(true);
      toast({
        title: 'Password Reset Successful',
        description: 'Your password has been updated. You can now log in with your new password.',
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      
      let errorMessage = 'Failed to reset password. Please try again.';
      
      if (error.code === 'auth/invalid-action-code') {
        errorMessage = 'Invalid reset link. Please request a new password reset.';
      } else if (error.code === 'auth/expired-action-code') {
        errorMessage = 'Reset link has expired. Please request a new password reset.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please choose a stronger password.';
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

  if (verifying) {
    return (
      <AuthShell title="Reset Password" subtitle="Verifying reset link…" icon={AlertCircle}>
        <Card className="w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (error) {
    return (
      <AuthShell title="Reset Password" subtitle="This link can’t be used." icon={AlertCircle}>
        <Card className="w-full">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-red-600">Invalid Link</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-4">
            <Link href="/forgot-password">
              <Button className="w-full">Request New Reset Link</Button>
            </Link>
            <Link href="/portal-login" className="text-sm text-center text-muted-foreground hover:underline">
              ← Back to Login
            </Link>
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell title="Reset Password" subtitle="Password updated." icon={CheckCircle}>
        <Card className="w-full">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-600">Password Reset Complete</CardTitle>
            <CardDescription>
              Your password has been successfully updated. You can now log in with your new password.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-4">
            <Link href="/portal-login">
              <Button className="w-full">Go to Login</Button>
            </Link>
            <Link href="/" className="text-sm text-center text-muted-foreground hover:underline flex items-center justify-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }

  if (!verified) {
    return (
      <AuthShell title="Reset Password" subtitle="Preparing…" icon={AlertCircle}>
        <Card className="w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground">Please wait while we verify your reset link...</p>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset Password" subtitle="Choose a new password." icon={CheckCircle}>
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">Set New Password</CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleResetPassword}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Password must be at least 6 characters long.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              loading={loading} disabled={loading}
            >
              {loading ? 'Updating Password...' : 'Update Password'}
            </Button>
            <Link href="/portal-login" className="text-sm text-center text-muted-foreground hover:underline">
              ← Back to Login
            </Link>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={
      <AuthShell title="Reset Password" subtitle="Loading…" icon={AlertCircle}>
        <Card className="w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
