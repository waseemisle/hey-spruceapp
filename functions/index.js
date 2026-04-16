const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin (automatically uses ADC when deployed)
admin.initializeApp();

// ── APPY client constants (must match lib/appy-client.ts) ──
const APPY_CLIENT_ID = 'UDPSxyTkDIcJijrMCVsb0pcOTpU2';
const APPY_CLIENT_DISPLAY_NAME = 'Jessica Cabrera-Olimon';
const APPY_CLIENT_EMAIL = 'jolimon@hwoodgroup.com';

// ── Cloudinary upload helper ──
async function uploadImageToCloudinary(base64Image) {
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

// ── Bearer token verification ──
async function verifyBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false };
  }

  const token = authHeader.substring(7);

  try {
    const db = admin.firestore();
    const tokensSnapshot = await db
      .collection('api_tokens')
      .where('token', '==', token)
      .get();

    if (tokensSnapshot.empty) {
      return { valid: false };
    }

    const tokenDoc = tokensSnapshot.docs[0];
    tokenDoc.ref.update({ lastUsed: admin.firestore.FieldValue.serverTimestamp() })
      .catch(err => console.error('Error updating lastUsed:', err));

    return { valid: true, tokenId: tokenDoc.id };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { valid: false };
  }
}

// ── Maintenance Requests HTTP function ──
// Handles GET (list) and POST (create) — proxied from Vercel to bypass 4.5MB body limit.
// Uses v1 syntax so HTTP functions are automatically public (no IAM policy needed).
exports.maintRequests = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    // Verify bearer token
    const tokenVerification = await verifyBearerToken(req.headers.authorization);
    if (!tokenVerification.valid) {
      return res.status(401).json({ error: 'Unauthorized. Valid bearer token required.' });
    }

    const db = admin.firestore();

    // ── GET: list maintenance requests ──
    if (req.method === 'GET') {
      try {
        const snapshot = await db
          .collection('maint_requests')
          .orderBy('createdAt', 'desc')
          .get();

        const maintRequests = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            ...d,
            createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
            date: d.date?.toDate?.()?.toISOString() || d.date,
          };
        });

        return res.json({ success: true, count: maintRequests.length, data: maintRequests });
      } catch (error) {
        console.error('Error fetching maintenance requests:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch maintenance requests' });
      }
    }

    // ── POST: create maintenance request ──
    if (req.method === 'POST') {
      try {
        const { venue, requestor, date, title, description, image, priority } = req.body;

        if (!venue || !requestor || !date || !title || !description || !priority) {
          return res.status(400).json({
            error: 'Missing required fields: venue, requestor, date, title, description, and priority are required',
          });
        }

        // Upload image to Cloudinary if base64, otherwise use URL directly
        let imageUrl = null;
        if (image && typeof image === 'string' && image.startsWith('data:')) {
          try {
            console.log(`Uploading base64 image to Cloudinary (${(image.length / 1024 / 1024).toFixed(2)} MB)...`);
            imageUrl = await uploadImageToCloudinary(image);
            console.log('Cloudinary upload successful:', imageUrl);
          } catch (uploadError) {
            console.error('Error uploading image to Cloudinary:', uploadError);
            return res.status(500).json({
              error: 'Failed to upload image to Cloudinary',
              details: uploadError.message,
            });
          }
        } else if (image && typeof image === 'string') {
          imageUrl = image;
        }

        // Generate maintenance request number
        const maintSnapshot = await db.collection('maint_requests').get();
        const maintRequestCount = maintSnapshot.size + 1;
        const maintRequestNumber = `MR-${maintRequestCount.toString().padStart(8, '0')}`;

        // Create maintenance request document
        const maintRequestData = {
          maintRequestNumber,
          venue,
          requestor,
          date: new Date(date),
          title,
          description,
          image: imageUrl,
          priority,
          status: 'pending',
          workOrderNumber: '',
          workOrderId: '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('maint_requests').add(maintRequestData);

        // Auto-create work order
        try {
          // Find or create location
          let locationId = '';
          const locationsSnapshot = await db
            .collection('locations')
            .where('locationName', '==', venue)
            .get();

          if (!locationsSnapshot.empty) {
            locationId = locationsSnapshot.docs[0].id;
            console.log(`Found existing location: ${venue} (${locationId})`);
          } else {
            const autoCompanyId = 'yirKMXRWAuV2YaOJ1kfA';
            const autoCompanyName = 'The h.wood Group';
            const newLocationRef = await db.collection('locations').add({
              locationName: venue,
              clientId: '',
              clientName: 'Auto-Generated',
              clientEmail: '',
              companyId: autoCompanyId,
              companyName: autoCompanyName,
              address: { street: '', city: '', state: '', zip: '', country: 'USA' },
              propertyType: '',
              contactPerson: requestor || 'API Request',
              contactPhone: '',
              status: 'approved',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              createdBy: 'system',
              createdByName: 'Maintenance Request API',
              creationSource: 'maintenance_request_api',
              systemNotes: [{
                action: 'created',
                userId: 'system',
                userName: 'Maintenance Request API',
                timestamp: new Date().toISOString(),
                details: `Auto-generated from maintenance request. Requestor: ${requestor || 'Unknown'}. Venue: ${venue}. Company: ${autoCompanyName}.`,
              }],
            });
            locationId = newLocationRef.id;
            console.log(`Created new location: ${venue} (${locationId})`);
          }

          const workOrderNumber = `WO-${Date.now().toString().slice(-7).toUpperCase()}`;
          const now = new Date();

          const timelineEvent = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: now,
            type: 'created',
            userId: 'system',
            userName: 'Automated System',
            userRole: 'system',
            details: `Work order created automatically from maintenance request for ${venue}`,
            metadata: {
              source: 'maintenance_request_api',
              maintRequestId: docRef.id,
              requestor: requestor || 'Unknown',
              priority: priority,
            },
          };

          const workOrderRef = await db.collection('workOrders').add({
            workOrderNumber,
            clientId: APPY_CLIENT_ID,
            clientName: APPY_CLIENT_DISPLAY_NAME,
            clientEmail: APPY_CLIENT_EMAIL,
            appyRequestor: requestor || 'Unknown',
            companyId: 'yirKMXRWAuV2YaOJ1kfA',
            companyName: 'The h.wood Group',
            locationId: locationId,
            location: { id: locationId, locationName: venue },
            locationName: venue,
            locationAddress: venue,
            title: title,
            description: description,
            category: 'General Maintenance',
            categoryId: '',
            priority: priority || 'medium',
            status: 'pending',
            images: imageUrl ? [imageUrl] : [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'API',
            createdViaAPI: true,
            originalMaintRequestId: docRef.id,
            maintRequestNumber: maintRequestNumber,
            isMaintenanceRequestOrder: true,
            timeline: [timelineEvent],
            systemInformation: {
              createdBy: {
                id: 'system',
                name: 'Automated System (API)',
                role: 'system',
                timestamp: now,
              },
            },
          });

          console.log(`Created work order: ${workOrderNumber} (${workOrderRef.id})`);

          await docRef.update({
            workOrderNumber: workOrderNumber,
            workOrderId: workOrderRef.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Notify admins
          const adminsSnapshot = await db.collection('adminUsers').get();
          const notificationPromises = adminsSnapshot.docs.map(adminDoc =>
            db.collection('notifications').add({
              userId: adminDoc.id,
              userRole: 'admin',
              type: 'general',
              title: `New Maintenance Request: ${priority?.toUpperCase() || 'NORMAL'}`,
              message: `New maintenance request for ${venue}: ${title}`,
              link: '/admin-portal/work-orders',
              read: false,
              referenceId: docRef.id,
              referenceType: 'maintRequest',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          );
          await Promise.all(notificationPromises);

          // Send email notifications to admins
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';
          for (const adminDoc of adminsSnapshot.docs) {
            const adminData = adminDoc.data();
            const adminEmail = adminData.email;
            const adminName = adminData.fullName || 'Admin';
            if (!adminEmail || adminData.workOrderEmailNotifications === false) continue;

            try {
              let dateForEmail;
              if (date) {
                try {
                  const dateObj = date instanceof Date ? date : new Date(date);
                  dateForEmail = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : new Date().toISOString();
                } catch { dateForEmail = new Date().toISOString(); }
              }

              await fetch(`${appUrl}/api/email/send-maint-request-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  toEmail: adminEmail,
                  toName: adminName,
                  maintRequestId: docRef.id,
                  venue,
                  requestor,
                  title,
                  description,
                  priority,
                  date: dateForEmail,
                  portalLink: `${appUrl}/admin-portal/work-orders`,
                }),
              });
            } catch (emailError) {
              console.error('Failed to send email to admin:', adminEmail, emailError);
            }
          }

          // Return success with work order info
          return res.json({
            success: true,
            id: docRef.id,
            maintRequestNumber,
            workOrderNumber,
            workOrderId: workOrderRef.id,
            message: 'Maintenance request created successfully',
          });
        } catch (woError) {
          console.error('Error auto-creating work order:', woError);
          // Still return success for the maint request itself
          return res.json({
            success: true,
            id: docRef.id,
            maintRequestNumber,
            workOrderNumber: null,
            workOrderId: null,
            message: 'Maintenance request created (work order creation failed)',
          });
        }
      } catch (error) {
        console.error('Error creating maintenance request:', error);
        return res.status(500).json({ error: error.message || 'Failed to create maintenance request' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  });

// Generate impersonation token
exports.generateImpersonationToken = functions.https.onCall(async (data, context) => {
  try {
    // Verify the requesting user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, role } = data;

    if (!userId || !role) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID and role are required');
    }

    if (role !== 'client' && role !== 'subcontractor') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid role. Only client and subcontractor can be impersonated'
      );
    }

    // Check if the requesting user is an admin
    const adminDoc = await admin.firestore().collection('adminUsers').doc(context.auth.uid).get();
    if (!adminDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can impersonate users');
    }

    // Verify the target user exists
    const collectionName = role === 'client' ? 'clients' : 'subcontractors';
    const userDoc = await admin.firestore().collection(collectionName).doc(userId).get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', `${role} not found`);
    }

    const userData = userDoc.data();

    // Generate a custom token for impersonation
    const customToken = await admin.auth().createCustomToken(userId, {
      impersonating: true,
      originalAdmin: context.auth.uid,
      role: role,
    });

    // Create impersonation token
    const tokenData = JSON.stringify({
      customToken,
      userId,
      role,
      expiresAt: Date.now() + 3600000, // 1 hour
    });
    const impersonationToken = Buffer.from(tokenData)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return {
      success: true,
      impersonationToken,
      user: {
        id: userId,
        name: userData.fullName || userData.businessName || 'Unknown',
        email: userData.email,
      },
      expiresAt: 'after 1 hour',
    };
  } catch (error) {
    console.error('Error generating impersonation token:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to generate impersonation token');
  }
});

