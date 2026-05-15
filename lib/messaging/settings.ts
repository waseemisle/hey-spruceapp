import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import type { MessageChannel, MessageEventType } from './types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GlobalMessagingSettings {
  enabled: boolean;
  channels: {
    sms: { enabled: boolean };
  };
  events: {
    'subcontractor-approval': { sms: boolean };
    'bidding-opportunity': { sms: boolean };
    'quote-approved': { sms: boolean };
    'client-approval': { sms: boolean };
    'work-order-assigned': { sms: boolean };
    'work-order-completed': { sms: boolean };
  };
  audience: {
    subcontractors: boolean;
    clients: boolean;
  };
  testRecipient?: string;
  updatedAt: Timestamp;
  updatedBy?: string;
}

export interface SubcontractorMessagingPermission {
  subcontractorId: string;
  enabled: boolean;
  channels?: { sms?: boolean };
  events?: {
    'subcontractor-approval'?: { sms?: boolean };
    'bidding-opportunity'?: { sms?: boolean };
    'quote-approved'?: { sms?: boolean };
  };
  phoneOverride?: string;
  updatedAt: Timestamp;
  updatedBy?: string;
}

export interface TargetDecision {
  channel: MessageChannel;
  allowed: boolean;
  reason?: string;
}

export interface ResolveTargetsResult {
  decisions: TargetDecision[];
  resolvedPhone?: string;
  subName?: string;
  subEmail?: string;
}

// ── Default global settings ────────────────────────────────────────────────

const DEFAULT_GLOBAL: Omit<GlobalMessagingSettings, 'updatedAt'> = {
  enabled: false,
  channels: {
    sms: { enabled: false },
  },
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

// ── 30-second in-memory cache ──────────────────────────────────────────────

let cachedGlobal: GlobalMessagingSettings | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000;

export function clearMessagingSettingsCache(): void {
  cachedGlobal = null;
  cacheExpiresAt = 0;
}

async function getGlobalSettings(): Promise<GlobalMessagingSettings> {
  if (cachedGlobal && Date.now() < cacheExpiresAt) return cachedGlobal;

  const db = await getServerDb();
  const snap = await getDoc(doc(db, 'messagingSettings', 'global'));

  if (!snap.exists()) {
    // Create defaults on first read
    const defaults: GlobalMessagingSettings = {
      ...DEFAULT_GLOBAL,
      updatedAt: Timestamp.now(),
    };
    await setDoc(doc(db, 'messagingSettings', 'global'), defaults).catch(() => {});
    cachedGlobal = defaults;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return defaults;
  }

  const data = snap.data() as GlobalMessagingSettings;
  cachedGlobal = data;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return data;
}

function isSmsConfigured(): boolean {
  return !!process.env.BLOOIO_API_KEY;
}

// ── Main resolution function ───────────────────────────────────────────────

export async function resolveMessagingTargets(opts: {
  type: MessageEventType;
  subcontractorId: string;
}): Promise<ResolveTargetsResult> {
  const { type, subcontractorId } = opts;

  const [global, db] = await Promise.all([getGlobalSettings(), getServerDb()]);

  // Fetch subcontractor doc
  const subSnap = await getDoc(doc(db, 'subcontractors', subcontractorId));
  const subData = subSnap.exists() ? subSnap.data() : null;
  const subName: string = subData?.fullName || subData?.businessName || '';
  const subEmail: string = subData?.email || '';
  const subStatus: string = subData?.status || '';

  // Fetch per-sub permission doc (may not exist)
  const permSnap = await getDoc(doc(db, 'subcontractorMessagingPermissions', subcontractorId));
  const perm: SubcontractorMessagingPermission | null = permSnap.exists()
    ? (permSnap.data() as SubcontractorMessagingPermission)
    : null;

  const resolvedPhone: string =
    perm?.phoneOverride || subData?.phone || subData?.phoneNumber || '';

  const decisions: TargetDecision[] = [];
  const channel: MessageChannel = 'sms';

  const decide = (allowed: boolean, reason?: string): void => {
    decisions.push({ channel, allowed, reason });
  };

  // 1. Global master switch
  if (!global.enabled) { decide(false, 'global-disabled'); }
  // 2. Channel switch
  else if (!global.channels.sms?.enabled) { decide(false, 'channel-sms-disabled'); }
  // 3. Audience: subcontractors
  else if (!global.audience.subcontractors) { decide(false, 'audience-subcontractors-disabled'); }
  // 4. Event switch
  else if (!(global.events as any)[type]?.sms) { decide(false, `event-${type}-sms-disabled`); }
  // 5. Per-sub master enabled (if perm doc exists)
  else if (perm && !perm.enabled) { decide(false, 'subcontractor-disabled'); }
  // 6. Per-sub channel override (if present)
  else if (perm?.channels && perm.channels.sms === false) { decide(false, 'subcontractor-channel-sms-disabled'); }
  // 7. Per-sub event override (if present)
  else if ((perm?.events as any)?.[type]?.sms === false) { decide(false, `subcontractor-event-${type}-sms-disabled`); }
  // 8. Phone check
  else if (!resolvedPhone) { decide(false, 'no-phone'); }
  // For non-approval events, require the sub be approved
  else if (type !== 'subcontractor-approval' && subStatus !== 'approved') { decide(false, 'subcontractor-not-approved'); }
  // 9. Provider configured
  else if (!isSmsConfigured()) { decide(false, 'provider-not-configured'); }
  else { decide(true); }

  return {
    decisions,
    resolvedPhone: resolvedPhone || undefined,
    subName: subName || undefined,
    subEmail: subEmail || undefined,
  };
}
