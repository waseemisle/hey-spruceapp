/**
 * Firestore list queries must be constrained so every possible result passes
 * security rules. Whole-collection listeners on supportTickets fail for clients/subs.
 */

import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
  type QuerySnapshot,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { SupportTicket } from '@/types';

export const OPEN_SUPPORT_STATUSES = [
  'open',
  'in-progress',
  'waiting-on-client',
  'waiting-on-admin',
] as const;

function lastActivityMs(t: SupportTicket): number {
  const la = t.lastActivityAt;
  if (la && typeof (la as { toMillis?: () => number }).toMillis === 'function') {
    return (la as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function sortTicketsByLastActivity(tickets: SupportTicket[]): void {
  tickets.sort((a, b) => lastActivityMs(b) - lastActivityMs(a));
}

function docToTicket(d: QueryDocumentSnapshot<DocumentData>): SupportTicket {
  return { id: d.id, ...d.data() } as SupportTicket;
}

function mergeTwoSnapshots(
  a: QuerySnapshot<DocumentData>,
  b: QuerySnapshot<DocumentData>,
): SupportTicket[] {
  const map = new Map<string, SupportTicket>();
  for (const d of a.docs) map.set(d.id, docToTicket(d));
  for (const d of b.docs) map.set(d.id, docToTicket(d));
  const list = [...map.values()];
  sortTicketsByLastActivity(list);
  return list;
}

export function subscribeClientSupportTickets(
  db: Firestore,
  uid: string,
  onTickets: (tickets: SupportTicket[]) => void,
  onError: (e: unknown) => void,
): () => void {
  const col = collection(db, 'supportTickets');
  const qSubmitted = query(col, where('submittedBy', '==', uid));
  const qClient = query(col, where('clientId', '==', uid));
  let sSubmitted: QuerySnapshot<DocumentData> | undefined;
  let sClient: QuerySnapshot<DocumentData> | undefined;

  const emit = () => {
    if (sSubmitted === undefined || sClient === undefined) return;
    onTickets(mergeTwoSnapshots(sSubmitted, sClient));
  };

  const u1 = onSnapshot(
    qSubmitted,
    (snap) => {
      sSubmitted = snap;
      emit();
    },
    onError,
  );
  const u2 = onSnapshot(
    qClient,
    (snap) => {
      sClient = snap;
      emit();
    },
    onError,
  );
  return () => {
    u1();
    u2();
  };
}

export function subscribeSubcontractorSupportTickets(
  db: Firestore,
  uid: string,
  onTickets: (tickets: SupportTicket[]) => void,
  onError: (e: unknown) => void,
): () => void {
  const col = collection(db, 'supportTickets');
  const qSubmitted = query(col, where('submittedBy', '==', uid));
  const qSub = query(col, where('subcontractorId', '==', uid));
  let sSubmitted: QuerySnapshot<DocumentData> | undefined;
  let sSub: QuerySnapshot<DocumentData> | undefined;

  const emit = () => {
    if (sSubmitted === undefined || sSub === undefined) return;
    onTickets(mergeTwoSnapshots(sSubmitted, sSub));
  };

  const u1 = onSnapshot(qSubmitted, (snap) => { sSubmitted = snap; emit(); }, onError);
  const u2 = onSnapshot(qSub, (snap) => { sSub = snap; emit(); }, onError);
  return () => {
    u1();
    u2();
  };
}

const OPEN_LIST = [...OPEN_SUPPORT_STATUSES];

/**
 * Admin nav badge: count of open-status tickets that have no assignee.
 * Uses a status-filtered query instead of listening to the entire collection.
 */
export function subscribeAdminUnassignedOpenSupportTicketCount(
  db: Firestore,
  onCount: (n: number) => void,
  onError: (e: unknown) => void,
): () => void {
  const col = collection(db, 'supportTickets');
  const q = query(col, where('status', 'in', OPEN_LIST));
  return onSnapshot(
    q,
    (snap) => {
      const n = snap.docs.filter((d) => !d.data().assignedTo).length;
      onCount(n);
    },
    onError,
  );
}

export function subscribeClientOpenSupportTicketCount(
  db: Firestore,
  uid: string,
  onCount: (n: number) => void,
  onError: (e: unknown) => void,
): () => void {
  const col = collection(db, 'supportTickets');
  const q1 = query(col, where('submittedBy', '==', uid), where('status', 'in', OPEN_LIST));
  const q2 = query(col, where('clientId', '==', uid), where('status', 'in', OPEN_LIST));
  let s1: QuerySnapshot<DocumentData> | undefined;
  let s2: QuerySnapshot<DocumentData> | undefined;

  const emit = () => {
    if (s1 === undefined || s2 === undefined) return;
    const ids = new Set<string>();
    s1.docs.forEach((d) => ids.add(d.id));
    s2.docs.forEach((d) => ids.add(d.id));
    onCount(ids.size);
  };

  const u1 = onSnapshot(q1, (snap) => { s1 = snap; emit(); }, onError);
  const u2 = onSnapshot(q2, (snap) => { s2 = snap; emit(); }, onError);
  return () => {
    u1();
    u2();
  };
}

export function subscribeSubcontractorOpenSupportTicketCount(
  db: Firestore,
  uid: string,
  onCount: (n: number) => void,
  onError: (e: unknown) => void,
): () => void {
  const col = collection(db, 'supportTickets');
  const q1 = query(col, where('submittedBy', '==', uid), where('status', 'in', OPEN_LIST));
  const q2 = query(col, where('subcontractorId', '==', uid), where('status', 'in', OPEN_LIST));
  let s1: QuerySnapshot<DocumentData> | undefined;
  let s2: QuerySnapshot<DocumentData> | undefined;

  const emit = () => {
    if (s1 === undefined || s2 === undefined) return;
    const ids = new Set<string>();
    s1.docs.forEach((d) => ids.add(d.id));
    s2.docs.forEach((d) => ids.add(d.id));
    onCount(ids.size);
  };

  const u1 = onSnapshot(q1, (snap) => { s1 = snap; emit(); }, onError);
  const u2 = onSnapshot(q2, (snap) => { s2 = snap; emit(); }, onError);
  return () => {
    u1();
    u2();
  };
}
