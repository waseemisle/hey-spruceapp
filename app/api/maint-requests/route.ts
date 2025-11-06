import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import sharp from 'sharp';

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

// Compress base64 image to reduce size
async function compressBase64Image(base64Image: string, maxSizeMB: number = 3.5): Promise<string> {
  try {
    // Extract base64 data and mime type
    const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 image format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const originalBuffer = Buffer.from(base64Data, 'base64');
    const originalSizeMB = originalBuffer.length / 1024 / 1024;

    console.log(`Original image size: ${originalSizeMB.toFixed(2)} MB`);

    // If image is already small enough, return as-is
    if (originalSizeMB <= maxSizeMB) {
      console.log('Image is already small enough, skipping compression');
      return base64Image;
    }

    // Compress the image using sharp
    let compressedBuffer: Buffer;
    
    try {
      // Get image metadata
      const metadata = await sharp(originalBuffer).metadata();
      const width = metadata.width || 1920;
      const height = metadata.height || 1080;
      
      // Calculate target dimensions (max 1920px width, maintain aspect ratio)
      const maxWidth = 1920;
      const maxHeight = 1920;
      let targetWidth = width;
      let targetHeight = height;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        targetWidth = Math.round(width * ratio);
        targetHeight = Math.round(height * ratio);
      }

      console.log(`Resizing from ${width}x${height} to ${targetWidth}x${targetHeight}`);

      // Compress: resize if needed, convert to JPEG with quality 80
      compressedBuffer = await sharp(originalBuffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ 
          quality: 80,
          mozjpeg: true, // Better compression
        })
        .toBuffer();

      const compressedSizeMB = compressedBuffer.length / 1024 / 1024;
      const compressionRatio = ((1 - compressedBuffer.length / originalBuffer.length) * 100).toFixed(1);
      
      console.log(`Compressed image size: ${compressedSizeMB.toFixed(2)} MB (${compressionRatio}% reduction)`);

      // If still too large, compress more aggressively
      if (compressedSizeMB > maxSizeMB) {
        console.log('Still too large, applying more aggressive compression...');
        compressedBuffer = await sharp(compressedBuffer)
          .jpeg({ 
            quality: 60,
            mozjpeg: true,
          })
          .toBuffer();
        
        const finalSizeMB = compressedBuffer.length / 1024 / 1024;
        console.log(`Final compressed size: ${finalSizeMB.toFixed(2)} MB`);
      }

      // Convert back to base64
      const compressedBase64 = compressedBuffer.toString('base64');
      return `data:image/jpeg;base64,${compressedBase64}`;
    } catch (sharpError: any) {
      console.error('Sharp compression error:', sharpError);
      // If sharp fails, return original (better than failing completely)
      console.log('Returning original image due to compression error');
      return base64Image;
    }
  } catch (error: any) {
    console.error('Image compression error:', error);
    // Return original if compression fails
    return base64Image;
  }
}

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
    // Check content-length header for logging
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / 1024 / 1024;
      console.log(`Request size: ${sizeInMB.toFixed(2)} MB`);
      
      // Note: Vercel has a 4.5MB hard limit at platform level
      // If the request exceeds this significantly, Vercel will reject it BEFORE it reaches this code
      // However, if the request made it here, we'll try to process it with compression
      if (parseInt(contentLength) > 10 * 1024 * 1024) {
        return NextResponse.json(
          { 
            error: 'Request payload too large. Maximum size is 10MB.',
            size: `${sizeInMB.toFixed(2)} MB`,
            suggestion: 'The image will be automatically compressed and uploaded to Cloudinary. Please ensure your payload is reasonable.'
          },
          { status: 413 }
        );
      }
    }

    // Use streaming to read the request body in chunks
    // This allows us to process large payloads that might exceed Vercel's limit
    // by reading the body stream directly instead of using request.json()
    const reader = request.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { error: 'Request body is required' },
        { status: 400 }
      );
    }
    
    console.log('Reading request body stream...');

    // Read the body stream in chunks
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB limit for safety

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        totalSize += value.length;
        if (totalSize > MAX_SIZE) {
          return NextResponse.json(
            { error: 'Request payload too large. Maximum size is 100MB.' },
            { status: 413 }
          );
        }
        
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks into a single buffer
    const allChunks = new Uint8Array(totalSize);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    // Parse JSON from the combined buffer
    const text = new TextDecoder().decode(allChunks);
    console.log(`Successfully read ${(totalSize / 1024 / 1024).toFixed(2)} MB from request body`);
    
    let data: any;
    
    try {
      data = JSON.parse(text);
      console.log('JSON parsed successfully');
    } catch (jsonError: any) {
      // Handle JSON parsing errors
      if (jsonError.message?.includes('too large') || 
          jsonError.message?.includes('FUNCTION_PAYLOAD_TOO_LARGE') ||
          jsonError.code === 'FUNCTION_PAYLOAD_TOO_LARGE' ||
          jsonError.message?.includes('413')) {
        return NextResponse.json(
          { 
            error: 'Request payload too large. Vercel has a 4.5MB platform limit.',
            suggestion: 'The image will be uploaded to Cloudinary automatically. Please ensure your payload is under 4.5MB or compress the image before sending.'
          },
          { status: 413 }
        );
      }
      
      return NextResponse.json(
        { error: 'Invalid JSON payload', details: jsonError.message },
        { status: 400 }
      );
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
        const originalImageSize = image.length;
        const originalSizeMB = (originalImageSize / 1024 / 1024).toFixed(2);
        console.log(`Original image size (base64): ${originalSizeMB} MB`);
        
        // Compress the image first to reduce size
        // This helps with requests that are just over the limit
        console.log('Compressing image...');
        const compressedImage = await compressBase64Image(image, 3.5); // Compress to under 3.5MB
        
        const compressedSize = compressedImage.length;
        const compressedSizeMB = (compressedSize / 1024 / 1024).toFixed(2);
        console.log(`Compressed image size (base64): ${compressedSizeMB} MB`);
        
        // Upload compressed image to Cloudinary
        console.log('Uploading compressed image to Cloudinary...');
        imageUrl = await uploadImageToCloudinary(compressedImage);
        console.log('Cloudinary upload successful:', imageUrl);
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
      console.log('Image is already a URL, using directly:', imageUrl);
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
