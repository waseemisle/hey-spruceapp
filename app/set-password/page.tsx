'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

function SetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('TEST_EMAIL_NOT_LOADED');
  const [uid, setUid] = useState('TEST_UID_NOT_LOADED');
  const [tempPassword, setTempPassword] = useState('');
  const [role, setRole] = useState<'client' | 'subcontractor' | ''>('');
  const [pageLoaded, setPageLoaded] = useState(false);

  useEffect(() => {
    console.log('🚀🚀🚀 SET PASSWORD PAGE LOADED 🚀🚀🚀');
    console.log('Current URL:', window.location.href);

    const tokenParam = searchParams.get('token');
    console.log('Token param from URL:', tokenParam);

    if (!tokenParam) {
      console.log('❌ NO TOKEN FOUND IN URL');
      toast.error('Invalid or missing password setup link');
      // Don't redirect immediately - let's see what's happening
      // router.push('/portal-login');
      setPageLoaded(true);
      return;
    }

    try {
      // Decode the token
      const decoded = JSON.parse(Buffer.from(tokenParam, 'base64').toString());

      console.log('🔍🔍🔍 TOKEN DECODED ON PAGE LOAD 🔍🔍🔍');
      console.log('Full decoded token:', decoded);
      console.log('Email from token:', decoded.email);
      console.log('UID from token:', decoded.uid);
      console.log('Role from token:', decoded.role);
      console.log('🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍');

      // Check if token is expired (24 hours)
      const tokenAge = Date.now() - decoded.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      if (tokenAge > maxAge) {
        toast.error('This password setup link has expired. Please request a new one.');
        router.push('/portal-login');
        return;
      }

      if (decoded.type !== 'password_setup') {
        toast.error('Invalid token type');
        router.push('/portal-login');
        return;
      }

      setToken(tokenParam);
      const emailValue = decoded.email || 'NO_EMAIL_IN_TOKEN';
      const uidValue = decoded.uid || 'NO_UID_IN_TOKEN';
      const roleValue = decoded.role || 'NO_ROLE_IN_TOKEN';

      setEmail(emailValue);
      setUid(uidValue);
      setTempPassword(decoded.tempPassword || '');
      setRole(roleValue);
      setPageLoaded(true);

      console.log('✅✅✅ STATE SET SUCCESSFULLY ✅✅✅');
      console.log('Email state:', emailValue);
      console.log('UID state:', uidValue);
      console.log('Role state:', roleValue);
      console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    } catch (error) {
      console.error('❌❌❌ Error decoding token:', error);
      toast.error('Invalid password setup link');
      setPageLoaded(true);
      // router.push('/portal-login');
    }
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

    setLoading(true);

    console.log('========================================');
    console.log('🔥 SETTING PASSWORD - CLIENT SIDE 🔥');
    console.log('Email:', email);
    console.log('UID from token:', uid);
    console.log('Role from token:', role);
    console.log('========================================');
    console.log('🔑 PASSWORD BEING SET:', password);
    console.log('========================================');
    console.log('🔑🔑🔑 USER PASSWORD 🔑🔑🔑');
    console.log('Password:', password);
    console.log('🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑');
    console.log('========================================');

    try {
      // Step 0: Get the actual UID from Firestore based on email
      console.log('🔍 Fetching UID from Firestore based on email...');
      let actualUid = uid;
      let actualRole = role;

      // Try to find user in clients collection
      const clientsQuery = query(collection(db, 'clients'), where('email', '==', email));
      const clientsSnapshot = await getDocs(clientsQuery);

      if (!clientsSnapshot.empty) {
        actualUid = clientsSnapshot.docs[0].id;
        actualRole = 'client';
        console.log('✅ Found in CLIENTS collection');
        console.log('Actual Client UID:', actualUid);
      } else {
        // Try subcontractors collection
        console.log('Not in clients, checking subcontractors...');
        const subsQuery = query(collection(db, 'subcontractors'), where('email', '==', email));
        const subsSnapshot = await getDocs(subsQuery);

        if (!subsSnapshot.empty) {
          actualUid = subsSnapshot.docs[0].id;
          actualRole = 'subcontractor';
          console.log('✅ Found in SUBCONTRACTORS collection');
          console.log('Actual Subcontractor UID:', actualUid);
        } else {
          console.error('❌ User not found in either collection with email:', email);
          throw new Error('User not found in database');
        }
      }

      console.log('========================================');
      console.log('Using UID:', actualUid);
      console.log('Using Role:', actualRole);
      console.log('========================================');

      // Step 1: Update Firebase Authentication password using the API
      console.log('🔐 Updating Firebase Authentication password...');

      const authResponse = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          uid: actualUid,
          tempPassword,
          newPassword: password,
        }),
      });

      const authData = await authResponse.json();

      if (!authResponse.ok) {
        console.error('❌ Auth API error:', authData.error);
        // Don't fail completely - just log and continue to store password
        console.log('⚠️ Auth update failed, but continuing to store password in Firestore...');
      } else {
        console.log('✓ Password updated in Firebase Authentication');
      }

      // Step 2: Store password in Firestore using the actual UID we found
      console.log('💾 Storing password in Firestore...');
      const collectionName = actualRole === 'client' ? 'clients' : 'subcontractors';
      const userDocRef = doc(db, collectionName, actualUid);

      await updateDoc(userDocRef, {
        password: password,
        passwordSetAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log('========================================');
      console.log('✓✓✓ PASSWORD STORED IN FIRESTORE ✓✓✓');
      console.log('Collection:', collectionName);
      console.log('UID:', actualUid);
      console.log('Email:', email);
      console.log('Password:', password);
      console.log('========================================');

      setSuccess(true);
      toast.success('Password set successfully!');

      // Redirect to login after 2 seconds
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
            Welcome to Hey Spruce! Please create a password to activate your account.
          </CardDescription>
          <div className="pt-4 space-y-2 bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
            <p className="text-lg font-bold text-gray-800">
              Setting password for Email: <span className="text-green-600">{email || 'Loading...'}</span>
            </p>
            <p className="text-lg font-bold text-gray-800">
              Setting password for Client UUID: <span className="text-blue-600">{uid || 'Loading from database...'}</span>
            </p>
            {role && (
              <p className="text-sm text-gray-600">
                Role: <span className="font-medium text-purple-600">{role}</span>
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
