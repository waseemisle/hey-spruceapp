import { NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, orderBy, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import sharp from 'sharp';
import { APPY_CLIENT_ID, APPY_CLIENT_DISPLAY_NAME, APPY_CLIENT_EMAIL } from '@/lib/appy-client';
import { getServerDb } from '@/lib/firebase-server';

// Route segment config - Next.js 14 format
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Maximum duration for serverless function (seconds)

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
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'duo4kzgx4';
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'WebAppUpload';

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64Image,
        upload_preset: uploadPreset,
        filename_override: `maint_request_${Date.now()}`,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Cloudinary upload error:', errorText);
    throw new Error(`Cloudinary ${response.status}: ${errorText}`);
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
    const db = await getServerDb();

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
    const db = await getServerDb();

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
    const contentType = request.headers.get('content-type') || '';
    let venue: string | undefined;
    let requestor: string | undefined;
    let date: string | undefined;
    let title: string | undefined;
    let description: string | undefined;
    let priority: string | undefined;
    let imageUrl: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      // ---- MULTIPART/FORM-DATA (supports large images) ----
      const formData = await request.formData();
      venue = formData.get('venue') as string;
      requestor = formData.get('requestor') as string;
      date = formData.get('date') as string;
      title = formData.get('title') as string;
      description = formData.get('description') as string;
      priority = formData.get('priority') as string;

      const imageField = formData.get('image');

      if (imageField instanceof File && imageField.size > 0) {
        // Binary file upload — compress with sharp then upload to Cloudinary
        console.log(`Image file received: ${imageField.name}, size: ${(imageField.size / 1024 / 1024).toFixed(2)} MB`);
        const arrayBuffer = await imageField.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let compressedBuffer: Buffer;
        try {
          const metadata = await sharp(buffer).metadata();
          const width = metadata.width || 1920;
          const height = metadata.height || 1080;
          const maxDim = 1920;
          let targetWidth = width;
          let targetHeight = height;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            targetWidth = Math.round(width * ratio);
            targetHeight = Math.round(height * ratio);
          }
          console.log(`Resizing from ${width}x${height} to ${targetWidth}x${targetHeight}`);

          compressedBuffer = await sharp(buffer)
            .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();

          console.log(`Compressed image size: ${(compressedBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        } catch (sharpError: any) {
          console.error('Sharp compression error, using original:', sharpError.message);
          compressedBuffer = buffer;
        }

        // Convert to base64 data URI for Cloudinary upload
        const base64Image = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
        console.log('Uploading image to Cloudinary...');
        imageUrl = await uploadImageToCloudinary(base64Image);
        console.log('Cloudinary upload successful:', imageUrl);
      } else if (typeof imageField === 'string' && imageField.length > 0) {
        // String value — could be a URL or base64
        if (imageField.startsWith('data:')) {
          console.log('Compressing base64 image from form field...');
          const compressedImage = await compressBase64Image(imageField, 3.5);
          imageUrl = await uploadImageToCloudinary(compressedImage);
          console.log('Cloudinary upload successful:', imageUrl);
        } else {
          imageUrl = imageField;
          console.log('Image is already a URL, using directly:', imageUrl);
        }
      }
    } else {
      // ---- JSON BODY (for smaller payloads / URL-only images) ----
      const data = await request.json();
      venue = data.venue;
      requestor = data.requestor;
      date = data.date;
      title = data.title;
      description = data.description;
      priority = data.priority;
      const image = data.image;

      if (image && typeof image === 'string' && image.startsWith('data:')) {
        console.log('Compressing base64 image...');
        const compressedImage = await compressBase64Image(image, 3.5);
        console.log('Uploading to Cloudinary...');
        imageUrl = await uploadImageToCloudinary(compressedImage);
        console.log('Cloudinary upload successful:', imageUrl);
      } else if (image && typeof image === 'string') {
        imageUrl = image;
        console.log('Image is already a URL, using directly:', imageUrl);
      }
    }

    // Validate required fields
    if (!venue || !requestor || !date || !title || !description || !priority) {
      return NextResponse.json(
        { error: 'Missing required fields: venue, requestor, date, title, description, and priority are required' },
        { status: 400 }
      );
    }

    const db = await getServerDb();

    // Generate maintenance request number
    // Get count of existing maint requests to generate next number
    const maintRequestsQuery = query(collection(db, 'maint_requests'));
    const maintRequestsSnapshot = await getDocs(maintRequestsQuery);
    const maintRequestCount = maintRequestsSnapshot.size + 1;
    const maintRequestNumber = `MR-${maintRequestCount.toString().padStart(8, '0')}`;

    // Create maintenance request document
    const maintRequestData = {
      maintRequestNumber,
      venue,
      requestor,
      date: new Date(date), // Convert ISO string to Date
      title,
      description,
      image: imageUrl, // Store Cloudinary URL instead of base64
      priority,
      status: 'pending', // Default status
      workOrderNumber: '', // Will be updated after work order is created
      workOrderId: '', // Will be updated after work order is created
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Add to Firestore
    const docRef = await addDoc(collection(db, 'maint_requests'), maintRequestData);

    // Auto-create work order from maint request
    try {
      // Find or create location
      let locationId = '';
      let locationName = venue;

      // Search for existing location by name
      const locationsQuery = query(
        collection(db, 'locations'),
        where('locationName', '==', locationName)
      );
      const locationsSnapshot = await getDocs(locationsQuery);

      if (!locationsSnapshot.empty) {
        // Location exists
        locationId = locationsSnapshot.docs[0].id;
        console.log(`Found existing location: ${locationName} (${locationId})`);
      } else {
        // Location doesn't exist - create it automatically
        // Assign to The h.wood Group company for all API-created locations
        const autoCompanyId = 'yirKMXRWAuV2YaOJ1kfA';
        const autoCompanyName = 'The h.wood Group';
        const newLocationRef = await addDoc(collection(db, 'locations'), {
          locationName: locationName,
          clientId: '', // No specific client (accessible via assigned locations)
          clientName: 'Auto-Generated',
          clientEmail: '',
          companyId: autoCompanyId,
          companyName: autoCompanyName,
          address: {
            street: '',
            city: '',
            state: '',
            zip: '',
            country: 'USA',
          },
          propertyType: '',
          contactPerson: requestor || 'API Request',
          contactPhone: '',
          status: 'approved', // Auto-approve for API-generated locations
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'system',
          createdByName: 'Maintenance Request API',
          creationSource: 'maintenance_request_api',
          systemNotes: [{
            action: 'created',
            userId: 'system',
            userName: 'Maintenance Request API',
            timestamp: new Date().toISOString(),
            details: `Auto-generated from maintenance request. Requestor: ${requestor || 'Unknown'}. Venue: ${locationName}. Company: ${autoCompanyName}.`,
          }],
        });

        locationId = newLocationRef.id;
        console.log(`Created new location: ${locationName} (${locationId})`);
      }

      // Generate work order number (7 digits)
      const workOrderNumber = `WO-${Date.now().toString().slice(-7).toUpperCase()}`;

      // Create initial timeline event (use Date instead of serverTimestamp in arrays)
      const now = new Date();
      const timelineEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        type: 'created',
        userId: 'system',
        userName: 'Automated System',
        userRole: 'system',
        details: `Work order created automatically from maintenance request for ${locationName}`,
        metadata: {
          source: 'maintenance_request_api',
          maintRequestId: docRef.id,
          requestor: requestor || 'Unknown',
          priority: priority,
        }
      };

      // Create system information
      const systemInformation = {
        createdBy: {
          id: 'system',
          name: 'Automated System (API)',
          role: 'system',
          timestamp: now,
        }
      };

      // Create work order
      // For APPY API requests, always set client to Jessica Cabrera-Olimon
      const workOrderRef = await addDoc(collection(db, 'workOrders'), {
        workOrderNumber,
        clientId: APPY_CLIENT_ID,
        clientName: APPY_CLIENT_DISPLAY_NAME,
        clientEmail: APPY_CLIENT_EMAIL,
        appyRequestor: requestor || 'Unknown', // Store the original requestor from the API request
        companyId: 'yirKMXRWAuV2YaOJ1kfA', // The h.wood Group
        companyName: 'The h.wood Group',
        locationId: locationId,
        location: { id: locationId, locationName: locationName },
        locationName: locationName,
        locationAddress: locationName,
        title: title,
        description: description,
        category: 'General Maintenance', // Default category
        categoryId: '',
        priority: priority || 'medium',
        status: 'pending', // Waiting for admin approval
        images: imageUrl ? [imageUrl] : [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: 'API',
        createdViaAPI: true, // Flag to identify API-created work orders
        originalMaintRequestId: docRef.id, // Link back to maint request
        maintRequestNumber: maintRequestNumber, // Reference to maintenance request number
        isMaintenanceRequestOrder: true, // Flag to indicate this work order was created from a maintenance request
        timeline: [timelineEvent],
        systemInformation: systemInformation,
      });

      console.log(`Created work order: ${workOrderNumber} (${workOrderRef.id})`);

      // Update maintenance request with work order reference
      await updateDoc(doc(db, 'maint_requests', docRef.id), {
        workOrderNumber: workOrderNumber,
        workOrderId: workOrderRef.id,
        updatedAt: serverTimestamp(),
      });

      console.log(`Updated maint request ${maintRequestNumber} with work order reference: ${workOrderNumber}`);

      // Notify admins about new maintenance request
      // Get all admin users
      const adminsQuery = query(collection(db, 'adminUsers'));
      const adminsSnapshot = await getDocs(adminsQuery);

      // Create in-app notifications for each admin
      const notificationPromises = adminsSnapshot.docs.map(async (adminDoc) => {
        await addDoc(collection(db, 'notifications'), {
          userId: adminDoc.id,
          userRole: 'admin',
          type: 'general',
          title: `New Maintenance Request: ${priority?.toUpperCase() || 'NORMAL'}`,
          message: `New maintenance request for ${venue}: ${title}`,
          link: `/admin-portal/work-orders`,
          read: false,
          referenceId: docRef.id,
          referenceType: 'maintRequest',
          createdAt: serverTimestamp(),
        });
      });

      await Promise.all(notificationPromises);

      // Send email to admins who have work order email notifications enabled
      for (const adminDoc of adminsSnapshot.docs) {
        const adminData = adminDoc.data();
        const adminEmail = adminData.email;
        const adminName = adminData.fullName || 'Admin';

        // Skip admins who have explicitly disabled work order email notifications
        if (!adminEmail || adminData.workOrderEmailNotifications === false) continue;

        try {
          // Format date for email - convert to ISO string if it's a Date object, otherwise use as-is
          let dateForEmail: string | undefined;
          if (date) {
            try {
              const dateObj = new Date(date);
              if (!isNaN(dateObj.getTime())) {
                dateForEmail = dateObj.toISOString();
              } else {
                console.warn('Invalid date received, using current date for email');
                dateForEmail = new Date().toISOString();
              }
            } catch (dateError) {
              console.error('Error processing date for email:', dateError);
              dateForEmail = new Date().toISOString(); // Fallback to current date
            }
          }

          await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email/send-maint-request-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: adminEmail,
              toName: adminName,
              maintRequestId: docRef.id,
              venue: venue,
              requestor: requestor,
              title: title,
              description: description,
              priority: priority,
              date: dateForEmail,
              portalLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin-portal/work-orders`,
            }),
          });
        } catch (emailError) {
          console.error('Failed to send email to admin:', adminEmail, emailError);
          // Don't fail the whole request if email fails
        }
      }

    } catch (error) {
      console.error('Error auto-creating work order from maint request:', error);
      // Don't fail the whole request if work order creation fails
    }

    // Get the updated maintenance request data to return
    const finalMaintRequest = await getDocs(query(
      collection(db, 'maint_requests'),
      where('__name__', '==', docRef.id)
    ));
    const updatedMaintRequestData = finalMaintRequest.docs[0]?.data();

    return NextResponse.json({
      success: true,
      id: docRef.id,
      maintRequestNumber: maintRequestNumber,
      workOrderNumber: updatedMaintRequestData?.workOrderNumber || null,
      workOrderId: updatedMaintRequestData?.workOrderId || null,
      message: 'Maintenance request created successfully',
    });
  } catch (error: any) {
    console.error('Error creating maintenance request:', error);
    
    if (error.message?.includes('too large') || error.code === 'FUNCTION_PAYLOAD_TOO_LARGE') {
      return NextResponse.json(
        {
          error: 'Request payload too large. Vercel has a 4.5MB limit for JSON bodies.',
          suggestion: 'Send as multipart/form-data with the image as a file field instead of base64 in JSON.',
        },
        { status: 413 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create maintenance request' },
      { status: 500 }
    );
  }
}
