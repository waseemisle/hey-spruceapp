import { NextResponse } from 'next/server';
import { getBearerUid, isUserAdmin } from '@/lib/api-verify-firebase';
import { getServerDb } from '@/lib/firebase-server';
import { clearMessagingSettingsCache } from '@/lib/messaging/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = await getServerDb();
    const admin = await isUserAdmin(db, uid);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    clearMessagingSettingsCache();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[cache/clear] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
