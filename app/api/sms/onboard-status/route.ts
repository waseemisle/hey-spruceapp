import { NextResponse } from 'next/server';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getServerDb();

    const adminSnap = await getDoc(doc(db, 'adminUsers', uid));
    if (!adminSnap.exists()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const snap = await getDocs(collection(db, 'blooioOnboarding'));

    const map: Record<string, { onboardedAt: string }> = {};
    let dailyCounter: { count: number; date: string; firstOnboardedAt: string | null } | null = null;

    snap.docs.forEach(d => {
      if (d.id === '_dailyCounter') {
        const data = d.data();
        dailyCounter = {
          count: data.count ?? 0,
          date: data.date ?? '',
          firstOnboardedAt: data.firstOnboardedAt?.toDate?.()?.toISOString() ?? null,
        };
      } else {
        const data = d.data();
        map[d.id] = { onboardedAt: data.onboardedAt?.toDate?.()?.toISOString() ?? '' };
      }
    });

    return NextResponse.json({ ok: true, map, dailyCounter });
  } catch (err: any) {
    console.error('[onboard-status]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
