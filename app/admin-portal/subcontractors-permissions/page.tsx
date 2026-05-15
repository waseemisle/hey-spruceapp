'use client';

import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { PortalListPage } from '@/components/ui/portal-list-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingCard, SettingRow } from '@/components/ui/setting-card';
import {
  ShieldCheck, MessageSquare, Smartphone, Users,
  Save, Search, TestTube2, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, AlertTriangle, Edit, Receipt, FileText, Stethoscope,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────

interface GlobalSettings {
  enabled: boolean;
  channels: { sms: { enabled: boolean } };
  events: Record<string, { sms: boolean }>;
  audience: { subcontractors: boolean; clients: boolean };
  testRecipient?: string;
}

const DEFAULT_GLOBAL: GlobalSettings = {
  enabled: false,
  channels: { sms: { enabled: false } },
  events: {
    'subcontractor-approval': { sms: false },
    'bidding-opportunity': { sms: false },
    'quote-approved': { sms: false },
    'client-approval': { sms: false },
    'work-order-assigned': { sms: false },
    'work-order-completed': { sms: false },
  },
  audience: { subcontractors: false, clients: false },
};

const ACTIVE_EVENTS = [
  { key: 'subcontractor-approval', label: 'Subcontractor Account Approved' },
  { key: 'bidding-opportunity', label: 'Subcontractor Invited to Bid' },
  { key: 'quote-approved', label: "Subcontractor's Quote Approved" },
];

const FUTURE_EVENTS = [
  { key: 'client-approval', label: 'Client Account Approved' },
  { key: 'work-order-assigned', label: 'Work Order Assigned' },
  { key: 'work-order-completed', label: 'Work Order Completed' },
];

interface Subcontractor {
  id: string;
  fullName: string;
  businessName?: string;
  email: string;
  phone?: string;
  phoneNumber?: string;
  status: string;
}

interface SubPerm {
  enabled: boolean;
  channels?: { sms?: boolean };
  events?: Record<string, { sms?: boolean }>;
  phoneOverride?: string;
}

interface EditPerm {
  canEditInvoice: boolean;
  canEditQuote: boolean;
  canEditDiagnostic: boolean;
}

interface TestResult {
  channel: string;
  status: string;
  providerMessageId?: string;
  error?: string;
  skipReason?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function clearServerCache(idToken: string) {
  await fetch('/api/messaging/cache/clear', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch(() => {});
}

function formatTimeUntilReset(firstOnboardedAt: any): string {
  const first = firstOnboardedAt?.toDate?.() ?? (firstOnboardedAt ? new Date(firstOnboardedAt) : null);
  if (!first) return '';
  const resetAt = new Date(first.getTime() + 24 * 60 * 60 * 1000);
  const diffMs = resetAt.getTime() - Date.now();
  if (diffMs <= 0) return 'soon';
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SubcontractorsPermissionsPage() {
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL);
  const [globalDirty, setGlobalDirty] = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [showFutureEvents, setShowFutureEvents] = useState(false);

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [subSearch, setSubSearch] = useState('');
  const [selectedSub, setSelectedSub] = useState<Subcontractor | null>(null);
  const [subPerm, setSubPerm] = useState<SubPerm>({ enabled: false });
  const [subPermDirty, setSubPermDirty] = useState(false);
  const [subPermSaving, setSubPermSaving] = useState(false);
  const [subPermLoading, setSubPermLoading] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testLoading, setTestLoading] = useState<'sms' | null>(null);
  const [subTestResults, setSubTestResults] = useState<TestResult[]>([]);
  const [subTestLoading, setSubTestLoading] = useState(false);

  // ── Edit Permissions state ─────────────────────────────────────────────────
  const [editPerm, setEditPerm] = useState<EditPerm>({ canEditInvoice: false, canEditQuote: false, canEditDiagnostic: false });
  const [editPermDirty, setEditPermDirty] = useState(false);
  const [editPermSaving, setEditPermSaving] = useState(false);
  const [editPermLoading, setEditPermLoading] = useState(false);

  // ── Onboarding state ───────────────────────────────────────────────────────
  const [onboardingMap, setOnboardingMap] = useState<Record<string, { onboardedAt: any }>>({});
  const [dailyCounter, setDailyCounter] = useState<{ count: number; date: string; firstOnboardedAt: any } | null>(null);
  const [onboardingPhone, setOnboardingPhone] = useState<string | null>(null);

  // Load only after auth is restored and adminUsers doc exists (matches Firestore `isAdmin()`).
  useEffect(() => {
    if (!auth || !db) {
      setGlobalLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setGlobalLoading(false);
        return;
      }
      void (async () => {
        const adminSnap = await getDoc(doc(db, 'adminUsers', firebaseUser.uid));
        if (!adminSnap.exists()) {
          setGlobalLoading(false);
          return;
        }
        await loadGlobal();
        await loadSubcontractors();
        await loadOnboardingData();
      })();
    });
    return () => unsub();
  }, []);

  async function loadGlobal() {
    setGlobalLoading(true);
    try {
      const u = auth?.currentUser;
      if (!u) return;
      const adminSnap = await getDoc(doc(db, 'adminUsers', u.uid));
      if (!adminSnap.exists()) return;

      const snap = await getDoc(doc(db, 'messagingSettings', 'global'));
      if (snap.exists()) {
        const data = snap.data() as GlobalSettings & { testRecipient?: string };
        setGlobalSettings({ ...DEFAULT_GLOBAL, ...data, events: { ...DEFAULT_GLOBAL.events, ...(data.events || {}) } });
        if (data.testRecipient) setTestPhone(data.testRecipient);
        else setTestPhone('+923212134142');
      } else {
        setTestPhone('+923212134142');
      }
    } catch (err) {
      console.error('Failed to load global settings:', err);
    } finally {
      setGlobalLoading(false);
    }
  }

  async function loadSubcontractors() {
    try {
      const snap = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
      const subs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subcontractor, 'id'>) }));
      setSubcontractors(subs);
    } catch (err) {
      console.error('Failed to load subcontractors:', err);
    }
  }

  async function loadOnboardingData() {
    try {
      const user = auth?.currentUser;
      const token = user ? await user.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/sms/onboard-status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setOnboardingMap(data.map ?? {});
      setDailyCounter(data.dailyCounter ?? null);
    } catch (err) {
      console.error('Failed to load onboarding data:', err);
    }
  }

  async function loadSubPerm(subId: string) {
    setSubPermLoading(true);
    try {
      const u = auth?.currentUser;
      if (!u) return;
      const adminSnap = await getDoc(doc(db, 'adminUsers', u.uid));
      if (!adminSnap.exists()) return;

      const snap = await getDoc(doc(db, 'subcontractorMessagingPermissions', subId));
      if (snap.exists()) {
        setSubPerm(snap.data() as SubPerm);
      } else {
        setSubPerm({ enabled: false });
      }
    } catch (err) {
      console.error('Failed to load sub perm:', err);
    } finally {
      setSubPermLoading(false);
      setSubPermDirty(false);
    }
  }

  async function loadEditPerm(subId: string) {
    setEditPermLoading(true);
    try {
      const u = auth?.currentUser;
      if (!u) return;
      const adminSnap = await getDoc(doc(db, 'adminUsers', u.uid));
      if (!adminSnap.exists()) return;

      const snap = await getDoc(doc(db, 'subcontractorEditPermissions', subId));
      if (snap.exists()) {
        const data = snap.data() as EditPerm;
        setEditPerm({
          canEditInvoice: data.canEditInvoice ?? false,
          canEditQuote: data.canEditQuote ?? false,
          canEditDiagnostic: data.canEditDiagnostic ?? false,
        });
      } else {
        setEditPerm({ canEditInvoice: false, canEditQuote: false, canEditDiagnostic: false });
      }
    } catch (err) {
      console.error('Failed to load edit permissions:', err);
    } finally {
      setEditPermLoading(false);
      setEditPermDirty(false);
    }
  }

  async function saveEditPerm() {
    if (!selectedSub) return;
    setEditPermSaving(true);
    try {
      const user = auth?.currentUser;
      if (!user) {
        toast.error('You must be signed in to save permissions.');
        return;
      }
      const adminSnap = await getDoc(doc(db, 'adminUsers', user.uid));
      if (!adminSnap.exists()) {
        toast.error('You do not have permission to change subcontractor edit permissions.');
        return;
      }
      await setDoc(
        doc(db, 'subcontractorEditPermissions', selectedSub.id),
        {
          ...editPerm,
          subcontractorId: selectedSub.id,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true },
      );
      await setDoc(
        doc(db, 'subcontractors', selectedSub.id),
        { editPermissions: editPerm, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setEditPermDirty(false);
      toast.success(`Edit permissions saved for ${selectedSub.fullName}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save edit permissions');
    } finally {
      setEditPermSaving(false);
    }
  }

  function updateGlobal(update: Partial<GlobalSettings>) {
    setGlobalSettings((prev) => ({ ...prev, ...update }));
    setGlobalDirty(true);
  }

  function updateGlobalEvent(eventKey: string, value: boolean) {
    setGlobalSettings((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [eventKey]: { sms: value },
      },
    }));
    setGlobalDirty(true);
  }

  function updateGlobalChannel(enabled: boolean) {
    setGlobalSettings((prev) => ({
      ...prev,
      channels: { sms: { enabled } },
    }));
    setGlobalDirty(true);
  }

  async function saveGlobal() {
    setGlobalSaving(true);
    try {
      const user = auth?.currentUser;
      if (!user) {
        toast.error('You must be signed in to save settings.');
        return;
      }
      const adminSnap = await getDoc(doc(db, 'adminUsers', user.uid));
      if (!adminSnap.exists()) {
        toast.error('You do not have permission to change messaging settings.');
        return;
      }
      const settingsToSave = {
        ...globalSettings,
        testRecipient: testPhone || '+923212134142',
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      };
      await setDoc(doc(db, 'messagingSettings', 'global'), settingsToSave, { merge: true });
      setGlobalDirty(false);
      toast.success('Global messaging settings saved');
      if (user) {
        const idToken = await user.getIdToken().catch(() => '');
        await clearServerCache(idToken);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings');
    } finally {
      setGlobalSaving(false);
    }
  }

  function selectSub(sub: Subcontractor) {
    setSelectedSub(sub);
    setSubTestResults([]);
    loadSubPerm(sub.id);
    loadEditPerm(sub.id);
  }

  function updateSubPerm(update: Partial<SubPerm>) {
    setSubPerm((prev) => ({ ...prev, ...update }));
    setSubPermDirty(true);
  }

  async function saveSubPerm() {
    if (!selectedSub) return;
    setSubPermSaving(true);
    try {
      const user = auth?.currentUser;
      if (!user) {
        toast.error('You must be signed in to save permissions.');
        return;
      }
      const adminSnap = await getDoc(doc(db, 'adminUsers', user.uid));
      if (!adminSnap.exists()) {
        toast.error('You do not have permission to change subcontractor messaging permissions.');
        return;
      }
      await setDoc(
        doc(db, 'subcontractorMessagingPermissions', selectedSub.id),
        {
          ...subPerm,
          subcontractorId: selectedSub.id,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid,
        },
        { merge: true },
      );
      setSubPermDirty(false);
      toast.success(`Saved permissions for ${selectedSub.fullName}`);
      if (user) {
        const idToken = await user.getIdToken().catch(() => '');
        await clearServerCache(idToken);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save sub permissions');
    } finally {
      setSubPermSaving(false);
    }
  }

  async function runTestSend(channels: ('sms')[], phone: string, setResults: (r: TestResult[]) => void, setLoading: (v: any) => void, loadingKey: any) {
    setLoading(loadingKey);
    setResults([]);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken().catch(() => '') : '';
      const adminDoc = user ? await getDoc(doc(db, 'adminUsers', user.uid)).catch(() => null) : null;
      const adminName = adminDoc?.exists() ? adminDoc.data().fullName : 'Admin';

      const res = await fetch('/api/messaging/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test',
          testPhone: phone,
          testFromAdmin: adminName,
          channels,
        }),
      });
      const data = await res.json();
      setResults(data.results || []);
      // Persist test recipient
      await setDoc(doc(db, 'messagingSettings', 'global'), { testRecipient: phone }, { merge: true }).catch(() => {});
      if (idToken) await clearServerCache(idToken);
    } catch (err: any) {
      toast.error(err?.message || 'Test send failed');
    } finally {
      setLoading(null);
    }
  }

  async function handleOnboardNumber(sub: Subcontractor) {
    const phone = sub.phone || sub.phoneNumber || '';
    if (!phone) { toast.error('No phone number on file for this subcontractor'); return; }
    setOnboardingPhone(phone);
    try {
      const user = auth?.currentUser;
      const token = user ? await user.getIdToken() : '';
      const res = await fetch('/api/sms/onboard-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, subcontractorId: sub.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          const resetAt = data.resetAt ? new Date(data.resetAt) : null;
          const timeLeft = resetAt ? Math.ceil((resetAt.getTime() - Date.now()) / 3600000) : null;
          toast.error(`Daily onboarding limit reached (5/5).${timeLeft ? ` Resets in ~${timeLeft}h.` : ''}`);
        } else {
          toast.error(data.error || 'Failed to onboard number');
        }
        return;
      }
      if (data.alreadyOnboarded) {
        toast.info('This number is already onboarded on Blooio.');
      } else {
        toast.success(`Number onboarded! ${data.remainingToday} slot${data.remainingToday !== 1 ? 's' : ''} remaining today.`);
      }
      await loadOnboardingData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to onboard');
    } finally {
      setOnboardingPhone(null);
    }
  }

  const filteredSubs = subcontractors.filter(
    (s) =>
      !subSearch ||
      s.fullName.toLowerCase().includes(subSearch.toLowerCase()) ||
      (s.businessName || '').toLowerCase().includes(subSearch.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(subSearch.toLowerCase()),
  );

  return (
    <PortalListPage
      title="Subcontractor Permissions"
      subtitle="Manage messaging and editing permissions for subcontractors"
      icon={ShieldCheck}
    >
      {/* ── Global Messaging ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Global Messaging</h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SettingCard title="Messaging Integration" icon={MessageSquare} accent="blue">
          <SettingRow label="Enable messaging globally" description="Master switch — all messages off when disabled">
            <Switch checked={globalSettings.enabled} onCheckedChange={(v) => updateGlobal({ enabled: v })} disabled={globalLoading} />
          </SettingRow>

          {globalSettings.enabled && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">SMS (Blooio)</p>
                  <p className="text-xs text-muted-foreground">Sends from +1 (407) 694-1682</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Configured
                  </span>
                  <Switch checked={globalSettings.channels.sms.enabled} onCheckedChange={(v) => updateGlobalChannel(v)} disabled={globalLoading} />
                </div>
              </div>
            </div>
          )}

          <div className="pt-1">
            <Button onClick={saveGlobal} disabled={!globalDirty || globalSaving} size="sm">
              {globalSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save</>}
            </Button>
          </div>
        </SettingCard>

        <SettingCard title="Audience" icon={Users} accent="emerald">
          <SettingRow label="Send to Subcontractors" description="Enable messaging for subcontractor events">
            <Switch
              checked={globalSettings.audience.subcontractors}
              onCheckedChange={(v) => updateGlobal({ audience: { ...globalSettings.audience, subcontractors: v } })}
              disabled={globalLoading}
            />
          </SettingRow>
          <div className="flex items-center justify-between gap-3 opacity-50 cursor-not-allowed">
            <div>
              <p className="text-sm font-medium">Send to Clients</p>
              <p className="text-xs text-muted-foreground">Coming soon</p>
            </div>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Coming soon</span>
          </div>
          <div className="pt-1">
            <Button onClick={saveGlobal} disabled={!globalDirty || globalSaving} size="sm">
              {globalSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save</>}
            </Button>
          </div>
        </SettingCard>
      </div>

      <SettingCard title="Notification Events" icon={ShieldCheck} accent="purple" description="Choose which events trigger SMS notifications">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[300px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-muted-foreground text-xs">Event</th>
                <th className="text-center py-2 px-4 font-semibold text-muted-foreground text-xs w-20">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ACTIVE_EVENTS.map(({ key, label }) => (
                <tr key={key}>
                  <td className="py-3 pr-4 text-sm font-medium">{label}</td>
                  <td className="py-3 px-4 text-center">
                    <Switch checked={globalSettings.events[key]?.sms ?? false} onCheckedChange={(v) => updateGlobalEvent(key, v)} disabled={globalLoading || !globalSettings.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button onClick={() => setShowFutureEvents((v) => !v)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {showFutureEvents ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Future events {showFutureEvents ? '(hide)' : '(show)'}
          </button>
          {showFutureEvents && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm min-w-[300px]">
                <tbody className="divide-y divide-border">
                  {FUTURE_EVENTS.map(({ key, label }) => (
                    <tr key={key} className="opacity-60">
                      <td className="py-3 pr-4">
                        <span className="text-sm font-medium">{label}</span>
                        <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">Coming soon</span>
                      </td>
                      <td className="py-3 px-4 text-center"><Switch checked={false} onCheckedChange={() => {}} disabled /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="pt-1">
          <Button onClick={saveGlobal} disabled={!globalDirty || globalSaving} size="sm">
            {globalSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save</>}
          </Button>
        </div>
      </SettingCard>

      <SettingCard title="Test Send" icon={TestTube2 as any} accent="amber" description="Verify your SMS integration without affecting real events">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Test phone number (E.164)</label>
            <Input placeholder="+923212134142" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="max-w-xs font-mono" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!!testLoading} onClick={() => runTestSend(['sms'], testPhone, setTestResults, setTestLoading, 'sms')}>
              {testLoading === 'sms' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}Send Test SMS
            </Button>
          </div>
          {testResults.length > 0 && (
            <div className="space-y-2">
              {testResults.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 text-sm">
                  {r.status === 'sent' || r.status === 'queued' || r.status === 'delivered'
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-medium">{r.channel.toUpperCase()} — {r.status}</p>
                    {r.providerMessageId && <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {r.providerMessageId}</p>}
                    {r.error && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{r.error}</p>}
                    {r.skipReason && <p className="text-xs text-muted-foreground mt-0.5">Skip reason: {r.skipReason}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingCard>

      {/* ── Per-Subcontractor (single master-detail) ────────────────────── */}
      <div className="flex items-center gap-2 pt-1">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Per-Subcontractor Permissions</h2>
      </div>

      {/* Blooio daily onboarding counter */}
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm ${
        !dailyCounter || dailyCounter.count === 0
          ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300'
          : dailyCounter.count >= 5
          ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300'
          : dailyCounter.count >= 4
          ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300'
          : 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300'
      }`}>
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 flex-shrink-0" />
          <span className="font-medium">
            Blooio onboarding: {dailyCounter?.count ?? 0} / 5 used today
          </span>
        </div>
        {dailyCounter && dailyCounter.count > 0 && (
          <span className="text-xs">
            {dailyCounter.count >= 5
              ? `Limit reached — resets in ${formatTimeUntilReset(dailyCounter.firstOnboardedAt)}`
              : `Resets in ${formatTimeUntilReset(dailyCounter.firstOnboardedAt)}`}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex min-h-[560px]">
          {/* Left rail */}
          <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredSubs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No approved subcontractors</p>
              ) : (
                filteredSubs.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => selectSub(sub)}
                    className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
                      selectedSub?.id === sub.id ? 'bg-primary/10 dark:bg-primary/15 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <p className="text-sm font-medium truncate">{sub.fullName}</p>
                    {sub.businessName && <p className="text-xs text-muted-foreground truncate">{sub.businessName}</p>}
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{sub.email}</p>
                    {(() => {
                      const phone = sub.phone || sub.phoneNumber || '';
                      if (!phone) return <span className="text-xs text-muted-foreground italic">No phone</span>;
                      const e164 = phone.replace(/\s/g, '').startsWith('+') ? phone.replace(/\s/g, '') : null;
                      const isOnboarded = e164 && onboardingMap[e164];
                      return isOnboarded
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />Onboarded</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" />Not onboarded</span>;
                    })()}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 overflow-y-auto">
            {!selectedSub ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
                <ShieldCheck className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Select a subcontractor</p>
                <p className="text-xs mt-1">Configure their messaging and edit permissions</p>
              </div>
            ) : (subPermLoading || editPermLoading) ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Sub header */}
                <div className="flex items-start gap-3 pb-4 border-b border-border">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {selectedSub.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-base truncate">{selectedSub.fullName}</p>
                    {selectedSub.businessName && <p className="text-sm text-muted-foreground truncate">{selectedSub.businessName}</p>}
                    <p className="text-xs text-muted-foreground">{selectedSub.email}</p>
                    {(selectedSub.phone || selectedSub.phoneNumber) && (
                      <p className="text-xs font-mono text-muted-foreground">{selectedSub.phone || selectedSub.phoneNumber}</p>
                    )}
                  </div>
                </div>

                {/* Blooio Onboarding */}
                {(() => {
                  const phone = selectedSub.phone || selectedSub.phoneNumber || '';
                  const e164 = phone.replace(/\s/g, '').startsWith('+') ? phone.replace(/\s/g, '') : phone ? `+${phone.replace(/\D/g,'').slice(-10)}` : null;
                  const isOnboarded = e164 ? !!onboardingMap[e164] : false;
                  const onboardedRec = e164 ? onboardingMap[e164] : null;
                  const limitReached = (dailyCounter?.count ?? 0) >= 5;
                  return (
                    <div className={`rounded-xl border p-4 space-y-2 ${isOnboarded ? 'border-green-200 bg-green-50/40 dark:bg-green-950/10 dark:border-green-800' : 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-800'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold">Blooio SMS Onboarding</p>
                            <p className="text-xs text-muted-foreground font-mono">{phone || 'No phone on file'}</p>
                          </div>
                        </div>
                        {isOnboarded ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="h-3.5 w-3.5" />Onboarded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 px-2.5 py-1 rounded-full">
                            <AlertTriangle className="h-3.5 w-3.5" />Not onboarded
                          </span>
                        )}
                      </div>
                      {isOnboarded && onboardedRec?.onboardedAt && (
                        <p className="text-xs text-muted-foreground">
                          Onboarded on {onboardedRec.onboardedAt?.toDate?.()?.toLocaleDateString() ?? '—'}
                        </p>
                      )}
                      {!isOnboarded && phone && (
                        <div className="pt-1">
                          {limitReached ? (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              Daily limit reached (5/5). Resets in {formatTimeUntilReset(dailyCounter?.firstOnboardedAt)}.
                            </p>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={onboardingPhone === phone}
                              onClick={() => handleOnboardNumber(selectedSub)}
                            >
                              {onboardingPhone === phone ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Onboarding...</> : <><Smartphone className="h-4 w-4 mr-2" />Onboard Number</>}
                            </Button>
                          )}
                        </div>
                      )}
                      {!phone && (
                        <p className="text-xs text-muted-foreground italic">Add a phone number to this subcontractor's profile first.</p>
                      )}
                    </div>
                  );
                })()}

                {/* Edit Submission Permissions */}
                <SettingCard title="Edit Submission Permissions" icon={Edit as any} accent="amber">
                  <SettingRow label="Can edit submitted invoice" description="Allow updating a direct invoice before it is approved or paid">
                    <Switch checked={editPerm.canEditInvoice} onCheckedChange={(v) => { setEditPerm(p => ({ ...p, canEditInvoice: v })); setEditPermDirty(true); }} />
                  </SettingRow>
                  <SettingRow label="Can edit submitted quote" description="Allow updating a quote before it is approved">
                    <Switch checked={editPerm.canEditQuote} onCheckedChange={(v) => { setEditPerm(p => ({ ...p, canEditQuote: v })); setEditPermDirty(true); }} />
                  </SettingRow>
                  <SettingRow label="Can edit diagnostic request" description="Allow updating a diagnostic request or results before admin review">
                    <Switch checked={editPerm.canEditDiagnostic} onCheckedChange={(v) => { setEditPerm(p => ({ ...p, canEditDiagnostic: v })); setEditPermDirty(true); }} />
                  </SettingRow>
                  <div className="pt-1">
                    <Button onClick={saveEditPerm} disabled={!editPermDirty || editPermSaving} size="sm">
                      {editPermSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Edit Permissions</>}
                    </Button>
                  </div>
                </SettingCard>

                {/* Messaging Override */}
                <SettingCard title="Messaging Override" icon={MessageSquare} accent="blue">
                  <SettingRow label="Receive messaging notifications" description="Overrides the global audience setting for this subcontractor">
                    <Switch checked={subPerm.enabled} onCheckedChange={(v) => updateSubPerm({ enabled: v })} />
                  </SettingRow>
                  {subPerm.enabled && (
                    <div className="space-y-3 pt-2">
                      <SettingRow label="SMS channel" indent>
                        <Switch checked={subPerm.channels?.sms !== false} onCheckedChange={(v) => updateSubPerm({ channels: { sms: v } })} />
                      </SettingRow>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Phone override (optional)</label>
                    <Input
                      placeholder={selectedSub.phone || selectedSub.phoneNumber || '+1...'}
                      value={subPerm.phoneOverride || ''}
                      onChange={(e) => updateSubPerm({ phoneOverride: e.target.value || undefined })}
                      className="max-w-xs font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave blank to use the phone from their profile.</p>
                  </div>
                  <div className="pt-1">
                    <Button onClick={saveSubPerm} disabled={!subPermDirty || subPermSaving} size="sm">
                      {subPermSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Messaging Override</>}
                    </Button>
                  </div>
                </SettingCard>

                {/* Test Send to this sub */}
                <SettingCard title="Test Send" icon={TestTube2 as any} accent="gray">
                  <p className="text-xs text-muted-foreground">
                    Sends a test to: <span className="font-mono">{subPerm.phoneOverride || selectedSub.phone || selectedSub.phoneNumber || 'No phone'}</span>
                  </p>
                  {!(subPerm.phoneOverride || selectedSub.phone || selectedSub.phoneNumber) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">No phone number on file.</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={subTestLoading || !(subPerm.phoneOverride || selectedSub.phone || selectedSub.phoneNumber)}
                      onClick={async () => {
                        const phone = subPerm.phoneOverride || selectedSub.phone || selectedSub.phoneNumber || '';
                        setSubTestLoading(true);
                        setSubTestResults([]);
                        try {
                          const user = auth.currentUser;
                          const adminDoc = user ? await getDoc(doc(db, 'adminUsers', user.uid)).catch(() => null) : null;
                          const adminName = adminDoc?.exists() ? adminDoc.data().fullName : 'Admin';
                          const res = await fetch('/api/messaging/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'test', testPhone: phone, testFromAdmin: adminName, channels: ['sms'] }),
                          });
                          const data = await res.json();
                          setSubTestResults(data.results || []);
                        } catch (err: any) {
                          toast.error(err?.message || 'Test failed');
                        } finally {
                          setSubTestLoading(false);
                        }
                      }}
                    >
                      {subTestLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
                      Send Test SMS
                    </Button>
                  </div>
                  {subTestResults.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {subTestResults.map((r, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 text-sm">
                          {r.status === 'sent' || r.status === 'queued' || r.status === 'delivered'
                            ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            : <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />}
                          <div className="min-w-0">
                            <p className="font-medium">{r.channel.toUpperCase()} — {r.status}</p>
                            {r.providerMessageId && <p className="text-xs font-mono text-muted-foreground mt-0.5">ID: {r.providerMessageId}</p>}
                            {r.error && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{r.error}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SettingCard>
              </div>
            )}
          </div>
        </div>
      </div>

    </PortalListPage>
  );
}
