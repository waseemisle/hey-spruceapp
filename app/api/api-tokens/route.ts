import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Initialize Firebase client SDK for server-side use
const getFirebaseApp = () => {
  if (getApps().length === 0) {
    return initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  }
  return getApp();
};

// Generate a secure random token
const generateToken = () => {
  return randomBytes(32).toString('hex');
};

// GET - Retrieve all API tokens
export async function GET(request: Request) {
  try {
    const app = getFirebaseApp();
    const db = getFirestore(app);

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
  try {
    const data = await request.json();
    const { name } = data;

    if (!name) {
      return NextResponse.json(
        { error: 'Token name is required' },
        { status: 400 }
      );
    }

    const app = getFirebaseApp();
    const db = getFirestore(app);

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
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('id');

    if (!tokenId) {
      return NextResponse.json(
        { error: 'Token ID is required' },
        { status: 400 }
      );
    }

    const app = getFirebaseApp();
    const db = getFirestore(app);

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
