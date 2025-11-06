import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

// Route segment config - Next.js 14 format
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Maximum duration for serverless function (seconds)

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

// Upload image to Cloudinary (server-side)
async function uploadImageToCloudinary(base64Image: string): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'danaxelcn';
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary configuration missing');
  }

  // Extract base64 data and mime type
  const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 image format');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  // Create FormData for Cloudinary upload
  // In Node.js 18+, FormData is available globally
  const formData = new FormData();
  
  // Create a Blob from the buffer
  const blob = new Blob([buffer], { type: mimeType });
  formData.append('file', blob);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Cloudinary upload error:', errorText);
    throw new Error(`Failed to upload image to Cloudinary: ${response.statusText}`);
  }

  const data = await response.json();
  return data.secure_url;
}

// Verify Bearer Token
async function verifyBearerToken(request: Request): Promise<{ valid: boolean; tokenId?: string }> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Query for the token in the api_tokens collection
    const tokensQuery = query(
      collection(db, 'api_tokens'),
      where('token', '==', token)
    );

    const querySnapshot = await getDocs(tokensQuery);

    if (querySnapshot.empty) {
      return { valid: false };
    }

    // Token is valid, return the token document ID
    const tokenDoc = querySnapshot.docs[0];

    // Update last used timestamp (don't await to avoid slowing down the response)
    updateDoc(doc(db, 'api_tokens', tokenDoc.id), {
      lastUsed: serverTimestamp(),
    }).catch(err => console.error('Error updating lastUsed:', err));

    return { valid: true, tokenId: tokenDoc.id };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { valid: false };
  }
}

export async function GET(request: Request) {
  // Verify bearer token
  const tokenVerification = await verifyBearerToken(request);
  if (!tokenVerification.valid) {
    return NextResponse.json(
      { error: 'Unauthorized. Valid bearer token required.' },
      { status: 401 }
    );
  }

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
  // Verify bearer token
  const tokenVerification = await verifyBearerToken(request);
  if (!tokenVerification.valid) {
    return NextResponse.json(
      { error: 'Unauthorized. Valid bearer token required.' },
      { status: 401 }
    );
  }

  try {
    // Read JSON payload directly
    // Note: Vercel has a 4.5MB hard limit at platform level that cannot be bypassed
    // If the request exceeds this limit, Vercel will reject it before it reaches this code
    let data: any;
    
    try {
      data = await request.json();
    } catch (jsonError: any) {
      // Handle various error cases
      if (jsonError.message?.includes('too large') || 
          jsonError.message?.includes('FUNCTION_PAYLOAD_TOO_LARGE') ||
          jsonError.code === 'FUNCTION_PAYLOAD_TOO_LARGE' ||
          jsonError.message?.includes('413')) {
        return NextResponse.json(
          { 
            error: 'Request payload too large. Vercel has a 4.5MB platform limit that cannot be bypassed with code.',
            suggestion: 'Please compress your image before sending (e.g., reduce quality, resize, or use compression). Base64 images are ~33% larger than the original file size.'
          },
          { status: 413 }
        );
      }
      
      // Check if it's a JSON parsing error
      if (jsonError.message?.includes('JSON') || jsonError.message?.includes('parse')) {
        return NextResponse.json(
          { error: 'Invalid JSON payload', details: jsonError.message },
          { status: 400 }
        );
      }
      
      // Re-throw if it's an unexpected error
      throw jsonError;
    }

    const { venue, requestor, date, title, description, image, priority } = data;

    // Validate required fields
    if (!venue || !requestor || !date || !title || !description || !priority) {
      return NextResponse.json(
        { error: 'Missing required fields: venue, requestor, date, title, description, and priority are required' },
        { status: 400 }
      );
    }

    // Upload image to Cloudinary if provided
    // This bypasses Vercel's 4.5MB limit by storing only the URL instead of base64
    let imageUrl: string | null = null;
    if (image && typeof image === 'string' && image.startsWith('data:')) {
      try {
        imageUrl = await uploadImageToCloudinary(image);
      } catch (uploadError: any) {
        console.error('Error uploading image to Cloudinary:', uploadError);
        return NextResponse.json(
          { 
            error: 'Failed to upload image to Cloudinary',
            details: uploadError.message 
          },
          { status: 500 }
        );
      }
    } else if (image && typeof image === 'string') {
      // If it's already a URL, use it directly
      imageUrl = image;
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
      image: imageUrl, // Store Cloudinary URL instead of base64
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
    
    // Handle specific error types
    if (error.message?.includes('JSON')) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    
    if (error.message?.includes('too large') || error.code === 'FUNCTION_PAYLOAD_TOO_LARGE') {
      return NextResponse.json(
        { error: 'Request payload too large. Please reduce image size or use multipart/form-data format.' },
        { status: 413 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create maintenance request' },
      { status: 500 }
    );
  }
}
