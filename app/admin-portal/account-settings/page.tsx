'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, auth, storage } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
  User, Mail, Phone, Bell, Lock, Camera, Save, ArrowLeft, ShieldCheck,
} from 'lucide-react';

export default function AdminAccountSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Profile fields
  const [uid, setUid] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [workOrderEmailNotifications, setWorkOrderEmailNotifications] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!auth || !db) return;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push('/admin-login');
        return;
      }
      setUid(firebaseUser.uid);
      setEmail(firebaseUser.email || '');
      try {
        const snap = await getDoc(doc(db, 'adminUsers', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setFullName(data.fullName || firebaseUser.displayName || '');
          setPhone(data.phone || '');
          setWorkOrderEmailNotifications(data.workOrderEmailNotifications ?? false);
          setPhotoPreview(data.profileImageUrl || firebaseUser.photoURL || null);
        } else {
          setFullName(firebaseUser.displayName || '');
          setPhotoPreview(firebaseUser.photoURL || null);
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (!db || !auth || !uid) return;
    setSavingProfile(true);
    try {
      let uploadedUrl = photoPreview;
      if (photoFile && storage) {
        const storageRef = ref(storage, `profile-images/${uid}-${Date.now()}`);
        await uploadBytes(storageRef, photoFile);
        uploadedUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, 'adminUsers', uid), {
        fullName,
        phone,
        workOrderEmailNotifications,
        profileImageUrl: uploadedUrl || null,
        updatedAt: serverTimestamp(),
      });

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: fullName || undefined,
          photoURL: uploadedUrl || undefined,
        });
      }

      setPhotoFile(null);
      toast.success('Profile saved successfully');
    } catch (err: any) {
      console.error('Profile save error:', err);
      toast.error(err?.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!auth?.currentUser) {
      toast.error('Please re-login and try again');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill out all password fields');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Password update error:', err);
      toast.error(err?.message || 'Could not update password. Check your current password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = (fullName || email || 'A').slice(0, 2).toUpperCase();

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-8 pb-16">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your profile and security settings</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-xl border border-border p-6 space-y-4 animate-pulse">
                <div className="h-5 w-40 rounded bg-gray-200" />
                <div className="h-10 w-full rounded bg-gray-200" />
                <div className="h-10 w-full rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Profile Photo */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6">
                <Camera className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold text-foreground">Profile Photo</h2>
              </div>
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24 ring-4 ring-gray-100">
                  {photoPreview
                    ? <AvatarImage src={photoPreview} alt={fullName || 'Profile'} />
                    : <AvatarFallback className="text-xl font-bold bg-blue-100 text-blue-700">{initials}</AvatarFallback>
                  }
                </Avatar>
                <div className="space-y-2">
                  <Label htmlFor="profilePhoto" className="text-sm font-medium">Upload new photo</Label>
                  <Input
                    id="profilePhoto"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Max 5MB.</p>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold text-foreground">Personal Information</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      value={email}
                      disabled
                      className="pl-9 bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-foreground font-medium">Admin</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notification Preferences */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold text-foreground">Notification Preferences</h2>
              </div>
              <div className="flex items-center justify-between py-3 border border-border rounded-lg px-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Work Order Email Notifications</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Receive email alerts when work orders are created or updated</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={workOrderEmailNotifications}
                  onClick={() => setWorkOrderEmailNotifications(v => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    workOrderEmailNotifications ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow ring-0 transition-transform ${
                      workOrderEmailNotifications ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Save Profile Button */}
            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-2 px-6">
                <Save className="h-4 w-4" />
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>

            <Separator />

            {/* Change Password */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="h-5 w-5 text-blue-600" />
                <div>
                  <h2 className="text-base font-semibold text-foreground">Change Password</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Re-enter your current password to set a new one</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="secondary" onClick={handleUpdatePassword} disabled={savingPassword} className="gap-2">
                  <Lock className="h-4 w-4" />
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
