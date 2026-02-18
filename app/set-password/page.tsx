'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

/** Decode base64 token in the browser. Handles URL corruption: + can become space in query params. */
function decodeSetupToken(tokenParam: string): {
  email: string;
  uid: string;
  tempPassword: string;
  role: string;
  type?: string;
  timestamp?: number;
} | null {
  try {
    const normalized = tokenParam.replace(/ /g, '+');
    const jsonString = atob(normalized);
    const decoded = JSON.parse(jsonString);
    return {
      email: decoded.email || '',
      uid: decoded.uid || '',
      tempPassword: decoded.tempPassword || '',
      role: decoded.role || '',
      type: decoded.type,
      timestamp: decoded.timestamp,
    };
  } catch {
    return null;
  }
}

function SetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rawToken, setRawToken] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'client' | 'subcontractor' | 'admin' | ''>('');

  useEffect(() => {
    let tokenParam = searchParams.get('token') || '';

    if (!tokenParam) {
      toast.error('Invalid or missing password setup link');
      router.push('/portal-login');
      return;
    }

    tokenParam = decodeURIComponent(tokenParam);
    const normalizedToken = tokenParam.replace(/ /g, '+');
    const decoded = decodeSetupToken(normalizedToken);
    if (!decoded) {
      toast.error('Invalid password setup link');
      router.push('/portal-login');
      return;
    }
    if (decoded.type !== 'password_setup') {
      toast.error('Invalid token type');
      router.push('/portal-login');
      return;
    }
    const tokenAge = Date.now() - (decoded.timestamp || 0);
    const maxAge = 24 * 60 * 60 * 1000;
    if (tokenAge > maxAge) {
      toast.error('This password setup link has expired. Please request a new one.');
      router.push('/portal-login');
      return;
    }

    setRawToken(normalizedToken);
    setEmail(decoded.email);
    setRole(decoded.role as 'client' | 'subcontractor' | 'admin' | '');
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!rawToken) {
      toast.error('Invalid setup link. Please use the link from your invitation email.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken, newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to set password');
      }

      setSuccess(true);
      toast.success('Password set successfully! You can now sign in.');

      setTimeout(() => {
        router.push('/portal-login');
      }, 2000);
    } catch (error: any) {
      console.error('❌ Error setting password:', error);
      toast.error(error.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-12 pb-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Set Successfully!</h2>
            <p className="text-gray-600 mb-6">
              Your password has been set. Redirecting you to the login page...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Set Your Password
          </CardTitle>
          <CardDescription className="text-base">
            Welcome to GroundOps! Please create a password to activate your account.
          </CardDescription>
          <div className="pt-4 space-y-2 bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
            <p className="text-lg text-gray-800">
              Setting password for Email: <span className="text-green-600">{email || 'Loading...'}</span>
            </p>
            {role && (
              <p className="text-sm text-gray-600">
                Role: <span className="font-medium text-blue-600">{role}</span>
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">New Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && password.length < 6 && (
                <p className="text-xs text-red-600 mt-1">Password must be at least 6 characters</p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                disabled={loading || !password || !confirmPassword || password !== confirmPassword || password.length < 6}
              >
                {loading ? 'Setting Password...' : 'Set Password & Activate Account'}
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-sm text-gray-600">
              Already have a password?{' '}
              <a href="/portal-login" className="text-green-600 hover:text-green-700 font-medium">
                Sign in here
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SetPasswordContent />
    </Suspense>
  );
}
