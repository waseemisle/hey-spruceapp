import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
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
  try {
    // Verify ID token using Admin Auth
    const adminAuth = getAdminAuth();
    let decodedToken;
    
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (tokenError: any) {
      console.error('Token verification failed:', tokenError.message);
      return null;
    }
    
    const uid = decodedToken.uid;
    console.log('Token verified, UID:', uid);
    
    // Verify user is in adminUsers collection using client SDK (more reliable)
    try {
      const adminDoc = await getDoc(doc(db, 'adminUsers', uid));
      
      if (!adminDoc.exists()) {
        console.error(`Admin user not found in adminUsers collection for uid: ${uid}`);
        return null;
      }
      
      console.log('✅ Admin verified successfully');
      return uid;
    } catch (dbError: any) {
      console.error('Error accessing adminUsers collection:', dbError.message);
      
      // Try Admin SDK as fallback
      try {
        const adminDb = getFirestore();
        const adminDoc = await adminDb.collection('adminUsers').doc(uid).get();
        
        if (adminDoc.exists) {
          console.log('✅ Admin verified via Admin SDK fallback');
          return uid;
        }
      } catch (fallbackError: any) {
        console.error('Admin SDK fallback also failed:', fallbackError.message);
      }
      
      return null;
    }
  } catch (error: any) {
    console.error('Unexpected error in verifyAdminUser:', error.message);
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
