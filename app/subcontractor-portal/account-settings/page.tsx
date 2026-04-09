'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { User, Mail, Phone, Briefcase, CreditCard, Lock, Camera, Save, ArrowLeft, Landmark, Building2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function SubcontractorAccountSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [uid, setUid] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Bank account state
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [hasSavedBank, setHasSavedBank] = useState(false);
  const [savedBankLast4, setSavedBankLast4] = useState('');
  const [savedBankName, setSavedBankName] = useState('');
  const [savedAccountHolderName, setSavedAccountHolderName] = useState('');
  const [savedAccountType, setSavedAccountType] = useState('');
  const [savedRoutingNumber, setSavedRoutingNumber] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  useEffect(() => {
    if (!auth || !db) return;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/subcontractor-login'); return; }
      setUid(firebaseUser.uid);
      setEmail(firebaseUser.email || '');
      try {
        const snap = await getDoc(doc(db, 'subcontractors', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setFullName(data.fullName || firebaseUser.displayName || '');
          setPhone(data.phone || '');
          setBusinessName(data.businessName || '');
          setLicenseNumber(data.licenseNumber || '');
          setPhotoPreview(data.profileImageUrl || firebaseUser.photoURL || null);
          // Load bank account info
          if (data.bankAccount) {
            setHasSavedBank(true);
            setSavedBankLast4(data.bankAccount.accountNumberLast4 || '');
            setSavedBankName(data.bankAccount.bankName || '');
            setSavedAccountHolderName(data.bankAccount.accountHolderName || '');
            setSavedAccountType(data.bankAccount.accountType || '');
            setSavedRoutingNumber(data.bankAccount.routingNumber || '');
          }
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
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (!db || !auth || !uid) return;
    setSavingProfile(true);
    try {
      let uploadedUrl: string | null = photoPreview && !photoPreview.startsWith('blob:') ? photoPreview : null;
      if (photoFile) {
        try {
          uploadedUrl = await uploadToCloudinary(photoFile);
        } catch (photoErr: any) {
          console.error('Photo upload failed:', photoErr);
          toast.error(photoErr?.message || 'Photo upload failed — profile saved without new photo');
        }
      }
      const savePromise = setDoc(doc(db, 'subcontractors', uid), {
        fullName, phone, businessName, licenseNumber,
        profileImageUrl: uploadedUrl || null, updatedAt: serverTimestamp(),
      }, { merge: true });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Save timed out. Check your connection.')), 15000)
      );
      await Promise.race([savePromise, timeout]);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: fullName || undefined, photoURL: uploadedUrl || undefined });
      }
      setPhotoFile(null);
      toast.success('Profile saved successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!auth?.currentUser) { toast.error('Please re-login and try again'); return; }
    if (!currentPassword || !newPassword || !confirmPassword) { toast.error('Please fill out all password fields'); return; }
    if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      toast.success('Password updated successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update password. Check your current password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveBankAccount = async () => {
    if (!db || !uid) return;
    if (!bankName.trim()) { toast.error('Please enter your bank name'); return; }
    if (!accountHolderName.trim()) { toast.error('Please enter the account holder name'); return; }
    if (!routingNumber.trim() || !/^\d{9}$/.test(routingNumber.trim())) {
      toast.error('Routing number must be exactly 9 digits'); return;
    }
    if (!accountNumber.trim() || !/^\d{4,17}$/.test(accountNumber.trim())) {
      toast.error('Please enter a valid account number (4-17 digits)'); return;
    }
    if (accountNumber !== confirmAccountNumber) {
      toast.error('Account numbers do not match'); return;
    }

    setSavingBank(true);
    try {
      const last4 = accountNumber.trim().slice(-4);
      const encoded = btoa(accountNumber.trim()); // basic obfuscation

      await setDoc(doc(db, 'subcontractors', uid), {
        bankAccount: {
          bankName: bankName.trim(),
          accountHolderName: accountHolderName.trim(),
          accountType,
          routingNumber: routingNumber.trim(),
          accountNumberLast4: last4,
          accountNumberEncrypted: encoded,
          addedAt: hasSavedBank ? undefined : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setHasSavedBank(true);
      setSavedBankLast4(last4);
      setSavedBankName(bankName.trim());
      setSavedAccountHolderName(accountHolderName.trim());
      setSavedAccountType(accountType);
      setSavedRoutingNumber(routingNumber.trim());
      setEditingBank(false);
      setBankName('');
      setAccountHolderName('');
      setRoutingNumber('');
      setAccountNumber('');
      setConfirmAccountNumber('');
      toast.success('Bank account saved successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save bank account');
    } finally {
      setSavingBank(false);
    }
  };

  const handleRemoveBankAccount = async () => {
    if (!db || !uid) return;
    if (!confirm('Are you sure you want to remove your bank account information?')) return;
    setSavingBank(true);
    try {
      const { deleteField } = await import('firebase/firestore');
      await setDoc(doc(db, 'subcontractors', uid), {
        bankAccount: deleteField(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setHasSavedBank(false);
      setSavedBankLast4('');
      setSavedBankName('');
      setSavedAccountHolderName('');
      setSavedAccountType('');
      setSavedRoutingNumber('');
      setEditingBank(false);
      toast.success('Bank account removed');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove bank account');
    } finally {
      setSavingBank(false);
    }
  };

  const initials = (fullName || email || 'S').slice(0, 2).toUpperCase();

  return (
    <SubcontractorLayout>
      <div className="max-w-3xl mx-auto space-y-8 pb-16 p-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your profile and security settings</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="bg-card rounded-xl border border-border p-6 space-y-4 animate-pulse">
                <div className="h-5 w-40 rounded bg-gray-200" /><div className="h-10 w-full rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Profile Photo */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6"><Camera className="h-5 w-5 text-blue-600" /><h2 className="text-base font-semibold text-foreground">Profile Photo</h2></div>
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24 ring-4 ring-gray-100">
                  {photoPreview ? <AvatarImage src={photoPreview} alt={fullName || 'Profile'} /> : <AvatarFallback className="text-xl font-bold bg-blue-100 text-blue-700">{initials}</AvatarFallback>}
                </Avatar>
                <div className="space-y-2">
                  <Label htmlFor="profilePhoto" className="text-sm font-medium">Upload new photo</Label>
                  <Input id="profilePhoto" type="file" accept="image/*" onChange={handleFileChange} className="max-w-xs" />
                  <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Max 5MB.</p>
                </div>
              </div>
            </div>

            {/* Personal & Business Information */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6"><User className="h-5 w-5 text-blue-600" /><h2 className="text-base font-semibold text-foreground">Personal & Business Information</h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" value={email} disabled className="pl-9 bg-muted text-muted-foreground cursor-not-allowed" />
                  </div>
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="businessName">Business Name</Label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="businessName" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Your business name" className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="licenseNumber" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="Contractor license number" className="pl-9" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-2 px-6">
                <Save className="h-4 w-4" />
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>

            <Separator />

            {/* ACH Bank Account Information */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Landmark className="h-5 w-5 text-blue-600" />
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Payment Information (ACH)</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Add your bank account details so you can receive payments for completed work orders</p>
                  </div>
                </div>
              </div>

              {hasSavedBank && !editingBank ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-5">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">Bank Account on File</div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Bank Name:</span>
                            <span className="ml-2 font-medium text-foreground">{savedBankName}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Account Holder:</span>
                            <span className="ml-2 font-medium text-foreground">{savedAccountHolderName}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Account Type:</span>
                            <span className="ml-2 font-medium text-foreground capitalize">{savedAccountType}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Routing Number:</span>
                            <span className="ml-2 font-medium text-foreground">
                              {showAccountNumber ? savedRoutingNumber : '•••••' + savedRoutingNumber.slice(-4)}
                            </span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-muted-foreground">Account Number:</span>
                            <span className="ml-2 font-medium text-foreground">••••••••{savedBankLast4}</span>
                            <button
                              onClick={() => setShowAccountNumber(!showAccountNumber)}
                              className="ml-2 text-muted-foreground hover:text-foreground inline-flex items-center"
                              title={showAccountNumber ? 'Hide details' : 'Show routing number'}
                            >
                              {showAccountNumber ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingBank(true);
                        setBankName(savedBankName);
                        setAccountHolderName(savedAccountHolderName);
                        setAccountType(savedAccountType as 'checking' | 'savings');
                        setRoutingNumber(savedRoutingNumber);
                        setAccountNumber('');
                        setConfirmAccountNumber('');
                      }}
                    >
                      Update Bank Account
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemoveBankAccount} disabled={savingBank}>
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {!hasSavedBank && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <span className="font-semibold">No bank account on file.</span> Add your ACH bank account details to receive vendor payments for completed work orders.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="bankName">Bank Name</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="bankName"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          placeholder="e.g. Chase, Bank of America"
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="accountHolderName">Account Holder Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="accountHolderName"
                          value={accountHolderName}
                          onChange={(e) => setAccountHolderName(e.target.value)}
                          placeholder="Name on the account"
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="accountType">Account Type</Label>
                      <select
                        id="accountType"
                        value={accountType}
                        onChange={(e) => setAccountType(e.target.value as 'checking' | 'savings')}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="checking">Checking</option>
                        <option value="savings">Savings</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="routingNumber">Routing Number (9 digits)</Label>
                      <div className="relative">
                        <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="routingNumber"
                          value={routingNumber}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 9);
                            setRoutingNumber(v);
                          }}
                          placeholder="9-digit routing number"
                          className="pl-9"
                          maxLength={9}
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="accountNumber">Account Number</Label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="accountNumber"
                          value={accountNumber}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 17);
                            setAccountNumber(v);
                          }}
                          placeholder="Account number"
                          className="pl-9"
                          maxLength={17}
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirmAccountNumber">Confirm Account Number</Label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="confirmAccountNumber"
                          value={confirmAccountNumber}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 17);
                            setConfirmAccountNumber(v);
                          }}
                          placeholder="Re-enter account number"
                          className="pl-9"
                          maxLength={17}
                          inputMode="numeric"
                        />
                      </div>
                      {confirmAccountNumber && accountNumber !== confirmAccountNumber && (
                        <p className="text-xs text-red-500">Account numbers do not match</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end pt-2">
                    {editingBank && (
                      <Button variant="outline" onClick={() => { setEditingBank(false); setBankName(''); setAccountHolderName(''); setRoutingNumber(''); setAccountNumber(''); setConfirmAccountNumber(''); }}>
                        Cancel
                      </Button>
                    )}
                    <Button onClick={handleSaveBankAccount} disabled={savingBank} className="gap-2">
                      <Save className="h-4 w-4" />
                      {savingBank ? 'Saving...' : hasSavedBank ? 'Update Bank Account' : 'Save Bank Account'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Change Password */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="h-5 w-5 text-blue-600" />
                <div><h2 className="text-base font-semibold text-foreground">Change Password</h2><p className="text-sm text-muted-foreground mt-0.5">Re-enter your current password to set a new one</p></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input id="currentPassword" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 characters" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
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
    </SubcontractorLayout>
  );
}
