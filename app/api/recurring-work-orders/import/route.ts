import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { collection, query, getDocs, addDoc, serverTimestamp, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ImportRow {
  restaurant: string;
  serviceType: string;
  lastServiced: string;
  nextServiceDates: string[];
  frequencyLabel: string;
  scheduling: string;
  notes: string;
}

// Helper function to verify admin role
async function verifyAdminUser(idToken: string): Promise<string | null> {
  console.log('=== VERIFY ADMIN USER START ===');
  console.log('Token length:', idToken.length);
  console.log('Token preview:', idToken.substring(0, 20) + '...');
  
  try {
    console.log('Step 1: Getting Admin Auth...');
    const adminAuth = getAdminAuth();
    console.log('Admin Auth obtained successfully');
    
    let decodedToken;
    
    try {
      console.log('Step 2: Verifying ID token...');
      decodedToken = await adminAuth.verifyIdToken(idToken);
      console.log('Token verified successfully');
    } catch (tokenError: any) {
      console.error('❌ Token verification failed:', {
        message: tokenError.message,
        code: tokenError.code,
        errorInfo: tokenError.errorInfo,
        stack: tokenError.stack,
      });
      return null;
    }
    
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    console.log('✅ Token verified successfully');
    console.log('UID:', uid);
    console.log('Email:', email);
    console.log('Decoded token claims:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      auth_time: decodedToken.auth_time,
      exp: decodedToken.exp,
    });

    // Verify user is in adminUsers collection using Admin SDK
    console.log('Step 3: Initializing Admin App and Firestore...');
    const adminApp = getAdminApp();
    console.log('Admin App obtained:', !!adminApp);
    console.log('Admin App project ID:', adminApp.options?.projectId);
    
    const adminDb = getFirestore(adminApp);
    console.log('Admin Firestore obtained:', !!adminDb);
    
    let adminDoc;
    
    try {
      console.log(`Step 4: Checking adminUsers collection for uid: ${uid}`);
      const adminUsersRef = adminDb.collection('adminUsers').doc(uid);
      console.log('Document reference created');
      
      adminDoc = await adminUsersRef.get();
      console.log('Document fetched:', {
        exists: adminDoc.exists,
        id: adminDoc.id,
      });
    } catch (dbError: any) {
      console.error('❌ Error accessing adminUsers collection:', {
        message: dbError.message,
        code: dbError.code,
        uid: uid,
        stack: dbError.stack,
      });
      
      // Try fallback: use client SDK
      console.log('Attempting fallback with client SDK...');
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const clientAdminDoc = await getDoc(doc(db, 'adminUsers', uid));
        console.log('Client SDK fallback result:', {
          exists: clientAdminDoc.exists(),
          id: clientAdminDoc.id,
        });
        
        if (clientAdminDoc.exists()) {
          const clientAdminData = clientAdminDoc.data();
          console.log('✅ Admin verified via client SDK fallback for uid:', uid, {
            email: clientAdminData?.email,
            fullName: clientAdminData?.fullName,
          });
          return uid;
        }
      } catch (fallbackError: any) {
        console.error('❌ Client SDK fallback also failed:', {
          message: fallbackError.message,
          stack: fallbackError.stack,
        });
      }
      
      return null;
    }
    
    if (!adminDoc.exists) {
      console.error(`❌ Admin user not found in adminUsers collection for uid: ${uid}`);
      console.error('Checking if document exists at all...');
      
      // Try to list all admin users to see what's there
      try {
        const allAdminsSnapshot = await adminDb.collection('adminUsers').limit(5).get();
        const adminIds = allAdminsSnapshot.docs.map(doc => doc.id);
        console.log('Sample admin user IDs in collection:', adminIds);
      } catch (listError: any) {
        console.error('Could not list admin users:', listError.message);
      }
      
      // Try fallback: use client SDK
      console.log('Attempting fallback with client SDK...');
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const clientAdminDoc = await getDoc(doc(db, 'adminUsers', uid));
        console.log('Client SDK fallback result:', {
          exists: clientAdminDoc.exists(),
          id: clientAdminDoc.id,
          data: clientAdminDoc.exists() ? clientAdminDoc.data() : null,
        });
        
        if (clientAdminDoc.exists()) {
          const clientAdminData = clientAdminDoc.data();
          console.log('✅ Admin verified via client SDK fallback for uid:', uid, {
            email: clientAdminData?.email,
            fullName: clientAdminData?.fullName,
          });
          return uid;
        }
      } catch (fallbackError: any) {
        console.error('❌ Client SDK fallback also failed:', {
          message: fallbackError.message,
          stack: fallbackError.stack,
        });
      }
      
      return null;
    }

    const adminData = adminDoc.data();
    console.log('✅ Admin verified successfully');
    console.log('Admin data:', {
      uid: uid,
      email: adminData?.email,
      fullName: adminData?.fullName,
      role: adminData?.role,
    });
    console.log('=== VERIFY ADMIN USER END (SUCCESS) ===');
    return uid;
  } catch (error: any) {
    console.error('❌ Unexpected error in verifyAdminUser:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    console.log('=== VERIFY ADMIN USER END (ERROR) ===');
    return null;
  }
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

// Helper function to get location mapping
async function getLocationMapping(csvLocationName: string): Promise<string | null> {
  try {
    const mappingsQuery = query(
      collection(db, 'locationMappings'),
      where('csvLocationName', '==', csvLocationName)
    );
    const snapshot = await getDocs(mappingsQuery);
    
    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data().systemLocationId;
  } catch (error) {
    console.error('Error fetching location mapping:', error);
    return null;
  }
}

// Helper function to find company by name
async function findCompanyByName(name: string): Promise<string | null> {
  try {
    const companiesQuery = query(
      collection(db, 'companies'),
      where('name', '==', name)
    );
    const snapshot = await getDocs(companiesQuery);
    
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
async function findClientByName(name: string): Promise<string | null> {
  try {
    const clientsQuery = query(
      collection(db, 'clients'),
      where('fullName', '==', name)
    );
    const snapshot = await getDocs(clientsQuery);
    
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
async function getOrCreateCategory(categoryName: string): Promise<string> {
  try {
    const categoriesQuery = query(
      collection(db, 'categories'),
      where('name', '==', categoryName)
    );
    const snapshot = await getDocs(categoriesQuery);
    
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
      console.error('❌ Missing or invalid authorization header');
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
      console.error('❌ Invalid token format - token too short or empty');
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    console.log('=== CALLING VERIFY ADMIN USER ===');
    const adminUid = await verifyAdminUser(idToken);
    console.log('Verify result:', adminUid ? `✅ Success (UID: ${adminUid})` : '❌ Failed');
    
    if (!adminUid) {
      console.error('❌ Admin verification failed - user is not an admin or verification error occurred');
      console.log('=== IMPORT REQUEST END (AUTH FAILED) ===');
      return NextResponse.json(
        { error: 'Only admins can import recurring work orders. Please ensure you are logged in as an admin user.' },
        { status: 403 }
      );
    }

    console.log('✅ Admin verification successful, proceeding with import for admin:', adminUid);

    const body = await request.json();
    const { rows } = body as { rows: ImportRow[] };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows provided' },
        { status: 400 }
      );
    }

    // Get default company and client
    const defaultCompanyName = 'The h.wood Group';
    const defaultClientName = 'Jessica Cabrera-Olimon';

    const defaultCompanyId = await findCompanyByName(defaultCompanyName);
    if (!defaultCompanyId) {
      return NextResponse.json(
        { error: `Default company "${defaultCompanyName}" not found. Please create it first.` },
        { status: 400 }
      );
    }

    const defaultClientId = await findClientByName(defaultClientName);
    if (!defaultClientId) {
      return NextResponse.json(
        { error: `Default client "${defaultClientName}" not found. Please create it first.` },
        { status: 400 }
      );
    }

    // Get client and company details
    const clientDocRef = doc(db, 'clients', defaultClientId);
    const clientDocSnap = await getDoc(clientDocRef);
    if (!clientDocSnap.exists()) {
      return NextResponse.json(
        { error: 'Default client data not found' },
        { status: 400 }
      );
    }
    const clientData = clientDocSnap.data();

    const companyDocRef = doc(db, 'companies', defaultCompanyId);
    const companyDocSnap = await getDoc(companyDocRef);
    if (!companyDocSnap.exists()) {
      return NextResponse.json(
        { error: 'Default company data not found' },
        { status: 400 }
      );
    }
    const companyData = companyDocSnap.data();

    const created: string[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Get location mapping
        const locationId = await getLocationMapping(row.restaurant);
        if (!locationId) {
          errors.push({
            row: i + 1,
            error: `Location mapping not found for "${row.restaurant}". Please create a mapping first.`,
          });
          continue;
        }

        // Verify location exists
        const locationDocRef = doc(db, 'locations', locationId);
        const locationDocSnap = await getDoc(locationDocRef);
        if (!locationDocSnap.exists()) {
          errors.push({
            row: i + 1,
            error: `Location with ID "${locationId}" not found in system.`,
          });
          continue;
        }

        const locationData = locationDocSnap.data();

        // Get or create category
        const categoryId = await getOrCreateCategory(row.serviceType);

        // Parse dates
        const lastServiced = row.lastServiced ? parseDate(row.lastServiced) : null;
        const nextServiceDates = row.nextServiceDates
          .map(dateStr => parseDate(dateStr))
          .filter((date): date is Date => date !== null);

        // Map frequency to recurrence pattern
        const recurrenceConfig = mapFrequencyToRecurrencePattern(row.frequencyLabel);
        
        // Calculate next execution date
        const now = new Date();
        let nextExecution = new Date(now);
        if (recurrenceConfig.type === 'monthly') {
          nextExecution.setMonth(now.getMonth() + recurrenceConfig.interval);
        } else if (recurrenceConfig.type === 'weekly') {
          nextExecution.setDate(now.getDate() + (recurrenceConfig.interval * 7));
        }

        // Create recurrence pattern
        const recurrencePattern = {
          type: recurrenceConfig.type,
          interval: recurrenceConfig.interval,
          scheduling: row.scheduling || undefined,
        };

        // Create invoice schedule (default to monthly)
        const invoiceSchedule = {
          type: 'monthly' as const,
          interval: 1,
          time: '09:00',
          timezone: 'America/New_York',
        };

        // Generate work order number
        const workOrderNumber = `RWO-${Date.now().toString().slice(-8).toUpperCase()}-${i.toString().padStart(3, '0')}`;

        // Create recurring work order
        const recurringWorkOrderData = {
          workOrderNumber,
          clientId: defaultClientId,
          clientName: clientData.fullName,
          clientEmail: clientData.email,
          locationId,
          companyId: defaultCompanyId,
          companyName: companyData.name,
          locationName: locationData.locationName,
          locationAddress: locationData.address && typeof locationData.address === 'object'
            ? `${locationData.address.street || ''}, ${locationData.address.city || ''}, ${locationData.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
            : (locationData.address || 'N/A'),
          title: `${row.serviceType} - ${locationData.locationName}`,
          description: row.notes || `${row.serviceType} recurring service`,
          category: row.serviceType,
          categoryId: categoryId,
          priority: 'medium' as const,
          status: 'active' as const,
          recurrencePattern,
          invoiceSchedule,
          nextExecution,
          lastServiced: lastServiced || undefined,
          nextServiceDates: nextServiceDates.length > 0 ? nextServiceDates : undefined,
          notes: row.notes || undefined,
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          createdBy: adminUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await addDoc(collection(db, 'recurringWorkOrders'), recurringWorkOrderData);
        created.push(workOrderNumber);
      } catch (error: any) {
        console.error(`Error processing row ${i + 1}:`, error);
        errors.push({
          row: i + 1,
          error: error.message || 'Unknown error',
        });
      }
    }

    console.log('=== IMPORT REQUEST END (SUCCESS) ===');
    console.log('Created:', created.length);
    console.log('Errors:', errors.length);
    
    return NextResponse.json({
      success: true,
      created: created.length,
      errors: errors,
    });
  } catch (error: any) {
    console.error('❌ Error importing recurring work orders:', error);
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
