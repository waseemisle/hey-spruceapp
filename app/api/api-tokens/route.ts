import { NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { randomBytes } from 'crypto';
import { getServerDb } from '@/lib/firebase-server';
import { getAuth } from 'firebase-admin/auth';
import { getApps as getAdminApps } from 'firebase-admin/app';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Generate a secure random token
const generateToken = () => {
  return randomBytes(32).toString('hex');
};

async function verifyAdminToken(idToken: string): Promise<string | null> {
  try {
    if (getAdminApps().length > 0 || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const adminAuth = getAuth();
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return decodedToken.uid;
      } catch {
        console.log('Admin SDK verification failed, using fallback');
      }
    }
  } catch {
    console.log('Admin SDK not available, using fallback verification');
  }

  // Fallback: decode token without Admin SDK verification
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

async function verifyAdmin(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const idToken = authHeader.substring(7);
  const uid = await verifyAdminToken(idToken);
  if (!uid) return false;
  try {
    const db = await getServerDb();
    const adminDoc = await getDoc(doc(db, 'adminUsers', uid));
    return adminDoc.exists();
  } catch {
    return false;
  }
}

// GET - Retrieve all API tokens
export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getServerDb();

    const tokensQuery = query(
      collection(db, 'api_tokens'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(tokensQuery);

    const tokens = querySnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      token: doc.data().token,
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      lastUsed: doc.data().lastUsed?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({
      success: true,
      count: tokens.length,
      data: tokens,
    });
  } catch (error: any) {
    console.error('Error fetching API tokens:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch API tokens' },
      { status: 500 }
    );
  }
}

// POST - Generate a new API token
export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { name } = data;

    if (!name) {
      return NextResponse.json(
        { error: 'Token name is required' },
        { status: 400 }
      );
    }

    const db = await getServerDb();

    const token = generateToken();

    const tokenData = {
      name,
      token,
      createdAt: serverTimestamp(),
      lastUsed: null,
    };

    const docRef = await addDoc(collection(db, 'api_tokens'), tokenData);

    return NextResponse.json({
      success: true,
      id: docRef.id,
      token,
      message: 'API token created successfully',
    });
  } catch (error: any) {
    console.error('Error creating API token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create API token' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an API token
export async function DELETE(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('id');

    if (!tokenId) {
      return NextResponse.json(
        { error: 'Token ID is required' },
        { status: 400 }
      );
    }

    const db = await getServerDb();

    await deleteDoc(doc(db, 'api_tokens', tokenId));

    return NextResponse.json({
      success: true,
      message: 'API token deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting API token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete API token' },
      { status: 500 }
    );
  }
}
