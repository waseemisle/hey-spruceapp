import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { uid } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    }

    const { getAdminAuth } = await import('@/lib/firebase-admin');
    const adminAuth = getAdminAuth();
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // If the user doesn't exist in Auth, treat as success (already deleted)
    if (error?.errorInfo?.code === 'auth/user-not-found') {
      return NextResponse.json({ success: true });
    }
    console.error('Error deleting Firebase Auth user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user from Firebase Auth' },
      { status: 500 }
    );
  }
}
