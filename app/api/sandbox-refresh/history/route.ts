import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await getAdminAuth().verifyIdToken(idToken);

    const prodDb = getAdminFirestore();
    const snapshot = await prodDb
      .collection('sandboxRefreshHistory')
      .orderBy('startedAt', 'desc')
      .limit(20)
      .get();

    const history = snapshot.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        id: d.id,
        startedAt: data.startedAt?.toDate?.()?.toISOString() ?? null,
        completedAt: data.completedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ history });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
