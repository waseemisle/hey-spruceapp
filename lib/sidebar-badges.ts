/**
 * Sidebar badge utilities — server-persisted "last viewed" timestamps so badges
 * survive logout/login and clear correctly on visit.
 *
 * Storage:
 *   clients/{uid}.lastViewedAt        = { [badgeKey]: Timestamp }
 *   subcontractors/{uid}.lastViewedAt = { [badgeKey]: Timestamp }
 *
 * Badge count formula (per key):
 *   count = items the user owns that are in an "actionable" status
 *           AND have updatedAt > lastViewedAt[key]
 *
 * On navigation to the badge's page, we write lastViewedAt[key] = serverTimestamp(),
 * which clears the badge until the next update lands.
 */
import { Firestore, doc, serverTimestamp, setDoc } from 'firebase/firestore';

export type ClientBadgeKey =
  | 'workOrders'
  | 'recurringWorkOrders'
  | 'locations'
  | 'diagnosticRequests'
  | 'quotes'
  | 'invoices'
  | 'messages'
  | 'supportTickets';

export type SubBadgeKey =
  | 'bidding'
  | 'quotes'
  | 'assigned'
  | 'completedJobs'
  | 'messages'
  | 'supportTickets';

export type UserType = 'client' | 'subcontractor';

const COLLECTION_BY_USER_TYPE: Record<UserType, string> = {
  client: 'clients',
  subcontractor: 'subcontractors',
};

/**
 * Map a portal pathname to the badge key it should mark as viewed.
 * Returns null if the path doesn't correspond to any badged page.
 *
 * Match is by prefix so subroutes (e.g. /work-orders/[id]) also count as "viewed".
 */
export function pathnameToBadgeKey(
  pathname: string,
  userType: UserType,
): ClientBadgeKey | SubBadgeKey | null {
  if (!pathname) return null;
  if (userType === 'client') {
    if (pathname.startsWith('/client-portal/work-orders')) return 'workOrders';
    if (pathname.startsWith('/client-portal/recurring-work-orders')) return 'recurringWorkOrders';
    if (pathname.startsWith('/client-portal/locations')) return 'locations';
    if (pathname.startsWith('/client-portal/diagnostic-requests')) return 'diagnosticRequests';
    if (pathname.startsWith('/client-portal/quotes')) return 'quotes';
    if (pathname.startsWith('/client-portal/invoices')) return 'invoices';
    if (pathname.startsWith('/client-portal/messages')) return 'messages';
    if (pathname.startsWith('/client-portal/support-tickets')) return 'supportTickets';
    return null;
  }
  if (pathname.startsWith('/subcontractor-portal/bidding')) return 'bidding';
  if (pathname.startsWith('/subcontractor-portal/quotes')) return 'quotes';
  if (pathname.startsWith('/subcontractor-portal/assigned')) return 'assigned';
  if (pathname.startsWith('/subcontractor-portal/completed-jobs')) return 'completedJobs';
  if (pathname.startsWith('/subcontractor-portal/messages')) return 'messages';
  if (pathname.startsWith('/subcontractor-portal/support-tickets')) return 'supportTickets';
  return null;
}

/**
 * Write lastViewedAt[badgeKey] = serverTimestamp() on the user's profile doc.
 * Uses setDoc with merge so it works even if the lastViewedAt map doesn't exist yet.
 * Fire-and-forget — failures are logged but don't block the UI.
 */
export async function markBadgeViewed(
  dbInstance: Firestore,
  userType: UserType,
  uid: string,
  badgeKey: ClientBadgeKey | SubBadgeKey,
): Promise<void> {
  try {
    const ref = doc(dbInstance, COLLECTION_BY_USER_TYPE[userType], uid);
    await setDoc(
      ref,
      { lastViewedAt: { [badgeKey]: serverTimestamp() } },
      { merge: true },
    );
  } catch (error) {
    console.error(`[sidebar-badges] markBadgeViewed failed for ${userType}/${uid}/${badgeKey}:`, error);
  }
}

/**
 * Compare an item's updatedAt against the user's lastViewedAt[key].
 * Returns true if the item should count toward the badge (i.e. is "new" to the user).
 *
 * - If the user has never marked this badge viewed (no entry), every item counts.
 * - If the item has no updatedAt, fall back to createdAt.
 * - If neither exists, treat as new (safer to over-count than under-count).
 */
export function isItemUnviewed(
  itemUpdatedAt: any,
  itemCreatedAt: any,
  lastViewedAtForKey: any,
): boolean {
  const lastViewedMs = toMillis(lastViewedAtForKey);
  if (lastViewedMs == null) return true; // never viewed → everything is new
  const itemMs = toMillis(itemUpdatedAt) ?? toMillis(itemCreatedAt);
  if (itemMs == null) return true; // unknown timestamp → assume new
  return itemMs > lastViewedMs;
}

function toMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}
