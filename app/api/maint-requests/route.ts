import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';

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

export async function GET(request: Request) {
  try {
    // Initialize Firebase
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Get all maintenance requests, ordered by creation date (newest first)
    const maintRequestsQuery = query(
      collection(db, 'maint_requests'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(maintRequestsQuery);

    const maintRequests = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore Timestamps to ISO strings for JSON serialization
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
      date: doc.data().date?.toDate?.()?.toISOString() || doc.data().date,
    }));

    return NextResponse.json({
      success: true,
      count: maintRequests.length,
      data: maintRequests,
    });
  } catch (error: any) {
    console.error('Error fetching maintenance requests:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch maintenance requests' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const { venue, requestor, date, title, description, image, priority } = data;

    // Validate required fields
    if (!venue || !requestor || !date || !title || !description || !priority) {
      return NextResponse.json(
        { error: 'Missing required fields: venue, requestor, date, title, description, and priority are required' },
        { status: 400 }
      );
    }

    // Initialize Firebase
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Create maintenance request document
    const maintRequestData = {
      venue,
      requestor,
      date: new Date(date), // Convert ISO string to Date
      title,
      description,
      image: image || null, // Optional base64 encoded image
      priority,
      status: 'pending', // Default status
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Add to Firestore
    const docRef = await addDoc(collection(db, 'maint_requests'), maintRequestData);

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: 'Maintenance request created successfully',
    });
  } catch (error: any) {
    console.error('Error creating maintenance request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create maintenance request' },
      { status: 500 }
    );
  }
}
