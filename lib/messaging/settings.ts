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
    whatsapp: { enabled: boolean };
  };
  events: {
    'subcontractor-approval': { sms: boolean; whatsapp: boolean };
    'bidding-opportunity': { sms: boolean; whatsapp: boolean };
    'quote-approved': { sms: boolean; whatsapp: boolean };
    'client-approval': { sms: boolean; whatsapp: boolean };
    'work-order-assigned': { sms: boolean; whatsapp: boolean };
    'work-order-completed': { sms: boolean; whatsapp: boolean };
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
  channels?: { sms?: boolean; whatsapp?: boolean };
  events?: {
    'subcontractor-approval'?: { sms?: boolean; whatsapp?: boolean };
    'bidding-opportunity'?: { sms?: boolean; whatsapp?: boolean };
    'quote-approved'?: { sms?: boolean; whatsapp?: boolean };
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
    whatsapp: { enabled: false },
  },
  events: {
    'subcontractor-approval': { sms: false, whatsapp: false },
    'bidding-opportunity': { sms: false, whatsapp: false },
    'quote-approved': { sms: false, whatsapp: false },
    'client-approval': { sms: false, whatsapp: false },
    'work-order-assigned': { sms: false, whatsapp: false },
    'work-order-completed': { sms: false, whatsapp: false },
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

function isProviderConfigured(channel: MessageChannel): boolean {
  if (channel === 'sms') return !!process.env.BLOOIO_API_KEY;
  if (channel === 'whatsapp')
    return !!(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID);
  return false;
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

  const channels: MessageChannel[] = ['sms', 'whatsapp'];
  const decisions: TargetDecision[] = [];

  for (const channel of channels) {
    const decide = (allowed: boolean, reason?: string): void => {
      decisions.push({ channel, allowed, reason });
    };

    // 1. Global master switch
    if (!global.enabled) { decide(false, 'global-disabled'); continue; }

    // 2. Channel switch
    if (!global.channels[channel]?.enabled) { decide(false, `channel-${channel}-disabled`); continue; }

    // 3. Audience: subcontractors
    if (!global.audience.subcontractors) { decide(false, 'audience-subcontractors-disabled'); continue; }

    // 4. Event switch
    const eventSettings = (global.events as any)[type] as { sms: boolean; whatsapp: boolean } | undefined;
    if (!eventSettings || !eventSettings[channel]) { decide(false, `event-${type}-${channel}-disabled`); continue; }

    // 5. Per-sub master enabled (if perm doc exists)
    if (perm && !perm.enabled) { decide(false, 'subcontractor-disabled'); continue; }

    // 6. Per-sub channel override (if present)
    if (perm?.channels && perm.channels[channel] === false) {
      decide(false, `subcontractor-channel-${channel}-disabled`); continue;
    }

    // 7. Per-sub event override (if present)
    const subEvent = (perm?.events as any)?.[type] as { sms?: boolean; whatsapp?: boolean } | undefined;
    if (subEvent && subEvent[channel] === false) {
      decide(false, `subcontractor-event-${type}-${channel}-disabled`); continue;
    }

    // 8. Phone check (skip for approval event since the sub may not exist yet, but we still need phone)
    if (!resolvedPhone) { decide(false, 'no-phone'); continue; }

    // For non-approval events, require the sub be approved
    if (type !== 'subcontractor-approval' && subStatus !== 'approved') {
      decide(false, 'subcontractor-not-approved'); continue;
    }

    // 9. Provider configured
    if (!isProviderConfigured(channel)) { decide(false, 'provider-not-configured'); continue; }

    decide(true);
  }

  return {
    decisions,
    resolvedPhone: resolvedPhone || undefined,
    subName: subName || undefined,
    subEmail: subEmail || undefined,
  };
}
