import {
  doc,
  getDoc,
  query,
  collection,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

/**
 * Looks up a client's companyId by UID first, then falls back to an email
 * query when the UID doc exists but has no companyId (e.g. the admin created
 * the company record before the client signed up, so the doc was later
 * associated by email rather than UID).
 *
 * When the email fallback finds a match it auto-heals the UID doc so the
 * next load doesn't need to fall back again.
 */
export async function resolveClientCompanyId(
  db: Firestore,
  uid: string,
  email: string | null
): Promise<{ companyId: string; companyName: string } | null> {
  const uidDocRef = doc(db, 'clients', uid);
  const uidDoc = await getDoc(uidDocRef);

  if (uidDoc.exists()) {
    const data = uidDoc.data();
    if (data.companyId) {
      return {
        companyId: data.companyId as string,
        companyName: (data.companyName as string) || '',
      };
    }
  }

  if (!email) return null;

  const q = query(collection(db, 'clients'), where('email', '==', email));
  const snap = await getDocs(q);

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.companyId) {
      // Auto-heal: write companyId back to the UID doc so next load is fast.
      if (uidDoc.exists()) {
        await updateDoc(uidDocRef, {
          companyId: data.companyId,
          companyName: data.companyName || '',
          updatedAt: serverTimestamp(),
        });
      }
      return {
        companyId: data.companyId as string,
        companyName: (data.companyName as string) || '',
      };
    }
  }

  return null;
}
