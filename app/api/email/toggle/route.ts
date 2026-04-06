import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';

// GET: Check current email enabled status
export async function GET() {
  try {
    const db = await getServerDb();
    const settingsDoc = await getDoc(doc(db, 'appSettings', 'email'));
    const enabled = !settingsDoc.exists() || settingsDoc.data().enabled !== false;
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error('Error checking email settings:', error);
    return NextResponse.json({ enabled: true }); // Default to enabled
  }
}

// POST: Toggle email enabled status
export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const { enabled, userId, userName } = await request.json();

    await setDoc(doc(db, 'appSettings', 'email'), {
      enabled: !!enabled,
      lastModifiedAt: serverTimestamp(),
      lastModifiedBy: userId || 'unknown',
      lastModifiedByName: userName || 'Unknown',
    });

    console.log(`📧 Email sending ${enabled ? 'ENABLED' : 'DISABLED'} by ${userName || 'unknown'}`);

    return NextResponse.json({
      success: true,
      enabled: !!enabled,
    });
  } catch (error) {
    console.error('Error toggling email settings:', error);
    return NextResponse.json(
      { error: 'Failed to update email settings' },
      { status: 500 }
    );
  }
}
