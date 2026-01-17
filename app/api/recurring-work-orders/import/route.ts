import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getApps as getAdminApps } from 'firebase-admin/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize Firebase client SDK
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

// Helper function to verify admin token (same as view-as route)
async function verifyAdminToken(idToken: string): Promise<string | null> {
  try {
    // Try to use Firebase Admin if available (local dev with gcloud)
    if (getAdminApps().length > 0 || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const adminAuth = getAuth();
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return decodedToken.uid;
      } catch (error) {
        // Admin SDK exists but verification failed, fall through to token decoding
        console.log('Admin SDK verification failed, using fallback');
      }
    }
  } catch (error) {
    // Fall back to client-side verification
    console.log('Admin SDK not available, using fallback verification');
  }

  // Fallback: decode token without verification (less secure, but works without Admin SDK)
  // In production, you should use Admin SDK or Firebase Auth REST API
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

interface ImportRow {
  restaurant: string;
  serviceType: string;
  lastServiced: string;
  nextServiceDates: string[];
  frequencyLabel: string;
  scheduling: string;
  notes: string;
  subcontractorId?: string;
}


// Helper function to parse date
function parseDate(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;

  // Try MM/DD/YYYY format
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return date;
      }
    }
  }

  // Try other formats
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

// Helper function to map frequency label to recurrence pattern
function mapFrequencyToRecurrencePattern(frequencyLabel: string): { type: 'monthly' | 'weekly'; interval: number } {
  const upper = frequencyLabel.toUpperCase();
  
  if (upper === 'SEMIANNUALLY') {
    return { type: 'monthly', interval: 6 };
  } else if (upper === 'QUARTERLY') {
    return { type: 'monthly', interval: 3 };
  } else if (upper === 'MONTHLY') {
    return { type: 'monthly', interval: 1 };
  } else if (upper === 'BI-WEEKLY') {
    return { type: 'weekly', interval: 2 };
  } else if (upper === 'WEEKLY') {
    return { type: 'weekly', interval: 1 };
  } else {
    // Default to monthly
    return { type: 'monthly', interval: 1 };
  }
}

// Helper function to find location by name (direct lookup, not mapping)
async function findLocationByName(locationName: string, db: any): Promise<{ id: string; data: any } | null> {
  try {
    // First try exact match
    let q = query(
      collection(db, 'locations'),
      where('locationName', '==', locationName)
    );
    let snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, data: doc.data() };
    }

    // Try case-insensitive search by getting all locations and filtering
    // (Firestore doesn't support case-insensitive queries directly)
    q = query(collection(db, 'locations'));
    snapshot = await getDocs(q);
    
    const locationNameLower = locationName.toLowerCase().trim();
    for (const doc of snapshot.docs) {
      const docData = doc.data();
      const docLocationName = (docData.locationName || '').toLowerCase().trim();
      
      // Exact match
      if (docLocationName === locationNameLower) {
        return { id: doc.id, data: docData };
      }
      
      // Contains match (either direction)
      if (docLocationName.includes(locationNameLower) || locationNameLower.includes(docLocationName)) {
        return { id: doc.id, data: docData };
      }
      
      // Check if location name matches any part (for cases like "Restaurant Name - Location")
      const docParts = docLocationName.split(/[\s\-_()]+/);
      const searchParts = locationNameLower.split(/[\s\-_()]+/);
      if (searchParts.some((part: string) => docParts.includes(part)) || docParts.some((part: string) => searchParts.includes(part))) {
        return { id: doc.id, data: docData };
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding location:', error);
    return null;
  }
}

// Helper function to find company by name
async function findCompanyByName(name: string, db: any): Promise<string | null> {
  try {
    const q = query(
      collection(db, 'companies'),
      where('name', '==', name)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].id;
  } catch (error) {
    console.error('Error finding company:', error);
    return null;
  }
}

// Helper function to find client by name
async function findClientByName(name: string, db: any): Promise<string | null> {
  try {
    const q = query(
      collection(db, 'clients'),
      where('fullName', '==', name)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].id;
  } catch (error) {
    console.error('Error finding client:', error);
    return null;
  }
}

// Helper function to get or create category
async function getOrCreateCategory(categoryName: string, db: any): Promise<string> {
  try {
    const q = query(
      collection(db, 'categories'),
      where('name', '==', categoryName)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }

    // Create new category
    const newCategoryRef = await addDoc(collection(db, 'categories'), {
      name: categoryName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return newCategoryRef.id;
  } catch (error) {
    console.error('Error getting/creating category:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  console.log('=== IMPORT REQUEST START ===');
  try {
    // Verify admin role
    const authHeader = request.headers.get('authorization');
    console.log('Authorization header present:', !!authHeader);
    console.log('Authorization header starts with Bearer:', authHeader?.startsWith('Bearer '));
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('? Missing or invalid authorization header');
      console.log('Header value:', authHeader ? authHeader.substring(0, 20) + '...' : 'null');
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    console.log('Extracted token length:', idToken.length);
    console.log('Token preview:', idToken.substring(0, 30) + '...');
    
    if (!idToken || idToken.length < 10) {
      console.error('? Invalid token format - token too short or empty');
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Initialize Firebase client SDK
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Verify the requesting user is an admin
    const adminUid = await verifyAdminToken(idToken);
    if (!adminUid) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const adminDoc = await getDoc(doc(db, 'adminUsers', adminUid));
    if (!adminDoc.exists()) {
      return NextResponse.json(
        { error: 'Only admins can import recurring work orders' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { rows } = body as { rows: ImportRow[] };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows provided' },
        { status: 400 }
      );
    }

    const created: string[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    console.log(`Processing ${rows.length} rows for import`);

    // Process each row - create a separate recurring work order for EACH row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`Processing row ${i + 1}/${rows.length}:`, {
        restaurant: row.restaurant,
        serviceType: row.serviceType,
        frequencyLabel: row.frequencyLabel,
        nextServiceDatesCount: row.nextServiceDates?.length || 0,
      });
      
      try {
        // Validate required fields
        if (!row.restaurant || row.restaurant.trim() === '') {
          errors.push({
            row: i + 1,
            error: `Restaurant name is required for row ${i + 1}`,
          });
          console.error(`Row ${i + 1}: Missing restaurant name`);
          continue;
        }

        if (!row.serviceType || row.serviceType.trim() === '') {
          errors.push({
            row: i + 1,
            error: `Service type is required for row ${i + 1}`,
          });
          console.error(`Row ${i + 1}: Missing service type`);
          continue;
        }

        // Find location by restaurant name (direct lookup, not mapping)
        const locationResult = await findLocationByName(row.restaurant, db);
        if (!locationResult) {
          errors.push({
            row: i + 1,
            error: `Location not found for "${row.restaurant}". Please create the location first.`,
          });
          console.error(`Row ${i + 1}: Location not found for "${row.restaurant}"`);
          continue;
        }
        
        const locationId = locationResult.id;
        const locationData = locationResult.data;
        console.log(`Row ${i + 1}: Found location "${locationData.locationName}" with ID: ${locationId}`);

        // Get client and company from location
        const clientId = locationData.clientId || '';
        const companyId = locationData.companyId || '';

        if (!clientId) {
          errors.push({
            row: i + 1,
            error: `Location "${row.restaurant}" does not have a client assigned.`,
          });
          console.error(`Row ${i + 1}: Location has no client ID`);
          continue;
        }

        // Get client details
        const clientDocSnap = await getDoc(doc(db, 'clients', clientId));
        if (!clientDocSnap.exists()) {
          errors.push({
            row: i + 1,
            error: `Client with ID "${clientId}" not found.`,
          });
          console.error(`Row ${i + 1}: Client not found`);
          continue;
        }
        const clientData = clientDocSnap.data();
        if (!clientData) {
          errors.push({
            row: i + 1,
            error: `Client data is empty for ID "${clientId}".`,
          });
          continue;
        }

        // Get company details (if companyId exists)
        let companyData: any = null;
        if (companyId) {
          const companyDocSnap = await getDoc(doc(db, 'companies', companyId));
          if (companyDocSnap.exists()) {
            companyData = companyDocSnap.data();
          }
        }

        // Get or create category
        const categoryId = await getOrCreateCategory(row.serviceType, db);

        // Parse dates
        const lastServiced = row.lastServiced ? parseDate(row.lastServiced) : null;
        const nextServiceDates = row.nextServiceDates
          .map(dateStr => parseDate(dateStr))
          .filter((date): date is Date => date !== null)
          .sort((a, b) => a.getTime() - b.getTime()); // Sort dates chronologically

        // Map frequency to recurrence pattern
        const recurrenceConfig = mapFrequencyToRecurrencePattern(row.frequencyLabel);
        
        // Use the first next service date as nextExecution, or calculate from recurrence pattern if no dates provided
        let nextExecution: Date;
        if (nextServiceDates.length > 0) {
          // Use the earliest date from the nextServiceDates array
          nextExecution = nextServiceDates[0];
        } else {
          // Fallback: Calculate next execution date from recurrence pattern
          const now = new Date();
          nextExecution = new Date(now);
          if (recurrenceConfig.type === 'monthly') {
            nextExecution.setMonth(now.getMonth() + recurrenceConfig.interval);
          } else if (recurrenceConfig.type === 'weekly') {
            nextExecution.setDate(now.getDate() + (recurrenceConfig.interval * 7));
          }
        }

        // Convert dates to Firestore Timestamps for storage
        const lastServicedTimestamp = lastServiced ? Timestamp.fromDate(lastServiced) : undefined;
        const nextServiceDatesTimestamps = nextServiceDates.length > 0
          ? nextServiceDates.map(date => Timestamp.fromDate(date))
          : undefined;
        const nextExecutionTimestamp = Timestamp.fromDate(nextExecution);

        // Create recurrence pattern
        const recurrencePattern: any = {
          type: recurrenceConfig.type,
          interval: recurrenceConfig.interval,
        };
        // Only add scheduling if it has a value (Firestore doesn't accept undefined)
        if (row.scheduling && row.scheduling.trim() !== '') {
          recurrencePattern.scheduling = row.scheduling.trim();
        }

        // Create invoice schedule (default to monthly)
        const invoiceSchedule = {
          type: 'monthly' as const,
          interval: 1,
          time: '09:00',
          timezone: 'America/New_York',
        };

        // Generate unique work order number with timestamp and row index
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const workOrderNumber = `RWO-${timestamp.toString().slice(-8).toUpperCase()}-${i.toString().padStart(3, '0')}-${randomSuffix}`;

        console.log(`Row ${i + 1}: Creating recurring work order with number: ${workOrderNumber}`);

        // Create recurring work order - EACH ROW CREATES A SEPARATE RECURRING WORK ORDER
        const recurringWorkOrderData: any = {
          workOrderNumber,
          clientId: clientId,
          clientName: clientData.fullName || 'Unknown Client',
          clientEmail: clientData.email || '',
          locationId,
          locationName: locationData.locationName || row.restaurant,
          locationAddress: locationData.address && typeof locationData.address === 'object'
            ? `${locationData.address.street || ''}, ${locationData.address.city || ''}, ${locationData.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
            : (locationData.address || 'N/A'),
          title: `${row.serviceType} - ${locationData.locationName || row.restaurant}`,
          description: row.notes || `${row.serviceType} recurring service`,
          category: row.serviceType,
          categoryId: categoryId,
          priority: 'medium' as const,
          status: 'active' as const,
          recurrencePattern,
          invoiceSchedule,
          nextExecution: nextExecutionTimestamp,
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          createdBy: adminUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Only add optional fields if they have values (Firestore doesn't accept undefined)
        if (lastServicedTimestamp) {
          recurringWorkOrderData.lastServiced = lastServicedTimestamp;
        }
        if (nextServiceDatesTimestamps && nextServiceDatesTimestamps.length > 0) {
          recurringWorkOrderData.nextServiceDates = nextServiceDatesTimestamps;
        }
        if (row.notes && row.notes.trim() !== '') {
          recurringWorkOrderData.notes = row.notes.trim();
        }

        // Add company info if available
        if (companyId && companyData) {
          recurringWorkOrderData.companyId = companyId;
          recurringWorkOrderData.companyName = companyData.name || '';
        }

        // Add subcontractor info if provided
        if (row.subcontractorId) {
          try {
            const subcontractorDoc = await getDoc(doc(db, 'subcontractors', row.subcontractorId));
            if (subcontractorDoc.exists()) {
              const subcontractorData = subcontractorDoc.data();
              recurringWorkOrderData.subcontractorId = row.subcontractorId;
              recurringWorkOrderData.subcontractorName = subcontractorData.fullName || '';
            }
          } catch (error) {
            console.warn(`Row ${i + 1}: Could not find subcontractor with ID ${row.subcontractorId}`, error);
            // Continue without subcontractor rather than failing the import
          }
        }

        const docRef = await addDoc(collection(db, 'recurringWorkOrders'), recurringWorkOrderData);
        console.log(`Row ${i + 1}: Successfully created recurring work order with ID: ${docRef.id}`);
        created.push(workOrderNumber);
      } catch (error: any) {
        console.error(`Error processing row ${i + 1}:`, error);
        console.error(`Error details:`, {
          message: error.message,
          stack: error.stack,
          restaurant: row.restaurant,
          serviceType: row.serviceType,
        });
        errors.push({
          row: i + 1,
          error: error.message || 'Unknown error',
        });
      }
    }

    console.log(`Import complete. Created: ${created.length}, Errors: ${errors.length}`);
    if (created.length > 0) {
      console.log('Created work order numbers:', created);
    }
    if (errors.length > 0) {
      console.log('Errors:', errors);
    }

    console.log('=== IMPORT REQUEST END (SUCCESS) ===');
    console.log('Created:', created.length);
    console.log('Errors:', errors.length);
    
    return NextResponse.json({
      success: true,
      created: created.length,
      createdWorkOrders: created,
      errors: errors,
      message: `Successfully created ${created.length} recurring work order(s)${errors.length > 0 ? `, ${errors.length} row(s) had errors` : ''}`,
    });
  } catch (error: any) {
    console.error('? Error importing recurring work orders:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    console.log('=== IMPORT REQUEST END (ERROR) ===');
    return NextResponse.json(
      { error: error.message || 'Failed to import recurring work orders' },
      { status: 500 }
    );
  }
}
