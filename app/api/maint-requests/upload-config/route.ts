import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';

// Verify Bearer Token (same logic as maint-requests route)
async function verifyBearerToken(request: Request): Promise<{ valid: boolean; tokenId?: string }> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false };
  }

  const token = authHeader.substring(7);

  try {
    const db = await getServerDb();
    const tokensQuery = query(
      collection(db, 'api_tokens'),
      where('token', '==', token)
    );
    const querySnapshot = await getDocs(tokensQuery);

    if (querySnapshot.empty) {
      return { valid: false };
    }

    const tokenDoc = querySnapshot.docs[0];
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
  const tokenVerification = await verifyBearerToken(request);
  if (!tokenVerification.valid) {
    return NextResponse.json(
      { error: 'Unauthorized. Valid bearer token required.' },
      { status: 401 }
    );
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'duo4kzgx4';
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'WebAppUpload';

  return NextResponse.json({
    cloudinary_upload_url: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    upload_preset: uploadPreset,
    instructions: [
      'Step 1: POST the image directly to the cloudinary_upload_url (this bypasses Vercel\'s 4.5MB body limit).',
      'Step 2: In the POST body, include: file (base64 data URI or file), upload_preset.',
      'Step 3: The response will contain a secure_url field — use that as the "image" field in your maint-request POST.',
    ],
    example_upload_body: {
      file: 'data:image/jpeg;base64,...',
      upload_preset: uploadPreset,
    },
    example_maint_request_body: {
      venue: 'Location Name',
      requestor: 'John Doe',
      date: '2025-01-01',
      title: 'Request Title',
      description: 'Description here',
      image: 'https://res.cloudinary.com/...your-uploaded-image-url...',
      priority: 'medium',
    },
  });
}
