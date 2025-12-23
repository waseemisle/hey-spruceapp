'use client';

import { useState } from 'react';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import {
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  User as FirebaseUser,
} from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';

type PortalRole = 'client' | 'subcontractor';

type FirebaseInstances = {
  authInstance: any;
  dbInstance: any;
  storageInstance: any;
};

interface AccountSettingsDialogProps {
  user: FirebaseUser & { fullName?: string; profileImageUrl?: string; businessName?: string };
  role: PortalRole;
  instances: FirebaseInstances;
  onProfileUpdated?: (data: Partial<AccountSettingsDialogProps['user']>) => void;
}

export default function AccountSettingsDialog({
  user,
  role,
  instances,
  onProfileUpdated,
}: AccountSettingsDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || user?.displayName || '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.profileImageUrl || user?.photoURL || null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please upload an image file', variant: 'destructive' });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadProfilePhoto = async (file: File): Promise<string> => {
    const storageRef = ref(instances.storageInstance, `profile-images/${user.uid}-${Date.now()}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  };

  const handleSaveProfile = async () => {
    if (!instances.dbInstance || !instances.authInstance) {
      toast({ title: 'Missing connection', description: 'Firebase is not ready yet', variant: 'destructive' });
      return;
    }

    setSavingProfile(true);
    try {
      let uploadedUrl = photoPreview;
      if (photoFile) {
        uploadedUrl = await uploadProfilePhoto(photoFile);
      }

      const collectionName = role === 'client' ? 'clients' : 'subcontractors';
      await updateDoc(doc(instances.dbInstance, collectionName, user.uid), {
        fullName: fullName || user.displayName || user.email,
        profileImageUrl: uploadedUrl || null,
        updatedAt: serverTimestamp(),
      });

      if (instances.authInstance.currentUser) {
        await updateProfile(instances.authInstance.currentUser, {
          displayName: fullName || undefined,
          photoURL: uploadedUrl || undefined,
        });
      }

      onProfileUpdated?.({
        fullName,
        profileImageUrl: uploadedUrl || undefined,
        displayName: fullName || undefined,
        photoURL: uploadedUrl || undefined,
      });

      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
      setOpen(false);
    } catch (error: any) {
      console.error('Profile update error', error);
      toast({
        title: 'Update failed',
        description: error?.message || 'Unable to save profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!instances.authInstance?.currentUser) {
      toast({ title: 'Not signed in', description: 'Please re-login and try again.', variant: 'destructive' });
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Missing fields', description: 'Please fill out all password fields.', variant: 'destructive' });
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: 'Weak password', description: 'Use at least 6 characters.', variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', description: 'New password and confirmation must match.', variant: 'destructive' });
      return;
    }

    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
      await reauthenticateWithCredential(instances.authInstance.currentUser, credential);
      await updatePassword(instances.authInstance.currentUser, newPassword);
      toast({ title: 'Password updated', description: 'Your password has been changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password update error', error);
      toast({
        title: 'Could not update password',
        description: error?.message || 'Please confirm your current password and try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Account Settings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>Update your profile and password.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {photoPreview ? <AvatarImage src={photoPreview} alt={fullName || 'Profile'} /> : <AvatarFallback>{(fullName || user.email || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>}
            </Avatar>
            <div className="space-y-2">
              <Label htmlFor="profilePhoto">Profile photo</Label>
              <Input id="profilePhoto" type="file" accept="image/*" onChange={handleFileChange} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? 'Saving...' : 'Save profile'}
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <DialogTitle className="text-base">Change password</DialogTitle>
              <DialogDescription>Re-enter current password to set a new one.</DialogDescription>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>
            <Button variant="secondary" onClick={handleUpdatePassword} disabled={savingPassword}>
              {savingPassword ? 'Updating...' : 'Update password'}
            </Button>
          </div>
        </div>

        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

