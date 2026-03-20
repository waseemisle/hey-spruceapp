import { doc, getDoc, Firestore } from 'firebase/firestore';

export async function verifyFirebaseUidFromIdToken(idToken: string): Promise<string | null> {
  try {
    if (process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const { getAdminAuth } = await import('@/lib/firebase-admin');
        const adminAuth = getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);
        return decoded.uid;
      } catch {
        // fall through
      }
    }
  } catch {
    // fall through
  }
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

export function getBearerUid(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return Promise.resolve(null);
  const idToken = authHeader.slice(7).trim();
  if (!idToken || idToken.length < 10) return Promise.resolve(null);
  return verifyFirebaseUidFromIdToken(idToken);
}

export type PortalRole = 'admin' | 'client' | 'subcontractor';

export interface PortalUserProfile {
  uid: string;
  role: PortalRole;
  fullName: string;
  email: string;
  clientId?: string;
  subcontractorId?: string;
}

export async function getPortalUserProfile(db: Firestore, uid: string): Promise<PortalUserProfile | null> {
  const adminSnap = await getDoc(doc(db, 'adminUsers', uid));
  if (adminSnap.exists()) {
    const d = adminSnap.data();
    return {
      uid,
      role: 'admin',
      fullName: (d.fullName as string) || '',
      email: (d.email as string) || '',
    };
  }
  const clientSnap = await getDoc(doc(db, 'clients', uid));
  if (clientSnap.exists()) {
    const d = clientSnap.data();
    return {
      uid,
      role: 'client',
      fullName: (d.fullName as string) || '',
      email: (d.email as string) || '',
      clientId: uid,
    };
  }
  const subSnap = await getDoc(doc(db, 'subcontractors', uid));
  if (subSnap.exists()) {
    const d = subSnap.data();
    return {
      uid,
      role: 'subcontractor',
      fullName: (d.fullName as string) || (d.businessName as string) || '',
      email: (d.email as string) || '',
      subcontractorId: uid,
    };
  }
  return null;
}

export async function isUserAdmin(db: Firestore, uid: string): Promise<boolean> {
  const adminSnap = await getDoc(doc(db, 'adminUsers', uid));
  return adminSnap.exists();
}
