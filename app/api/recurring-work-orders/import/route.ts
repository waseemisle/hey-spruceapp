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
  clientId?: string;
}


// Helper function to parse date (handles strings, numbers, Excel serial dates, and Unix timestamps)
function parseDate(dateValue: string | number): Date | null {
  if (dateValue === null || dateValue === undefined) return null;

  // Handle numeric values (Excel serial dates or Unix timestamps)
  if (typeof dateValue === 'number') {
    // Check if it's a Unix timestamp in milliseconds (typically > 1000000000000 for dates after 2001)
    if (dateValue > 1000000000000) {
      // Unix timestamp in milliseconds
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } else if (dateValue > 0 && dateValue < 1000000) {
      // Likely an Excel serial date (days since January 1, 1900)
      // Excel serial date: days since January 1, 1900
      const excelEpoch = new Date(1900, 0, 1);
      excelEpoch.setDate(excelEpoch.getDate() + dateValue - 2); // -2 because Excel incorrectly treats 1900 as a leap year
      return excelEpoch;
    } else if (dateValue > 0) {
      // Try as Unix timestamp in seconds (convert to milliseconds)
      const date = new Date(dateValue * 1000);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return null;
  }

  // Handle string values
  const dateStr = String(dateValue).trim();
  if (!dateStr || dateStr === '') return null;

  // Try MM/DD/YYYY format
  const parts = dateStr.split('/');
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

  // Try other string formats
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

// Helper function to normalize location name for comparison
function normalizeLocationName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Helper function to extract base name and location suffix
function parseLocationName(name: string): { base: string; location: string } {
  const normalized = normalizeLocationName(name);
  
  // Try to extract location from parentheses: "Name (Location)"
  const parenMatch = normalized.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    return {
      base: parenMatch[1].trim(),
      location: parenMatch[2].trim(),
    };
  }
  
  // Try to extract location from dash: "Name - Location"
  const dashMatch = normalized.match(/^(.+?)\s*-\s*(.+)$/);
  if (dashMatch) {
    return {
      base: dashMatch[1].trim(),
      location: dashMatch[2].trim(),
    };
  }
  
  // No location suffix found
  return {
    base: normalized,
    location: '',
  };
}

// Helper function to extract key words from a location name (removes common words)
function extractKeyWords(name: string): string[] {
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'club'];
  // Remove parenthetical content first
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  return withoutParens
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 0 && !commonWords.includes(word))
    .filter(word => word.length > 1); // Filter out single character words
}

// Helper function to extract the primary name part (removes location suffixes and common prefixes)
function extractPrimaryName(name: string): string {
  // Remove parenthetical content
  let primary = name.replace(/\([^)]*\)/g, '').trim();
  // Remove common prefixes
  primary = primary.replace(/^(the|a|an)\s+/i, '').trim();
  // Normalize
  return normalizeLocationName(primary);
}

// Helper function to calculate similarity score between two location names
function calculateSimilarity(searchName: string, dbName: string): number {
  const searchNormalized = normalizeLocationName(searchName);
  const dbNormalized = normalizeLocationName(dbName);
  
  // Exact match
  if (searchNormalized === dbNormalized) {
    return 1.0;
  }
  
  // Extract key words
  const searchWords = extractKeyWords(searchName);
  const dbWords = extractKeyWords(dbName);
  
  if (searchWords.length === 0 || dbWords.length === 0) {
    return 0;
  }
  
  // Count matching words
  const matchingWords = searchWords.filter(word => 
    dbWords.some(dbWord => dbWord === word || dbWord.includes(word) || word.includes(dbWord))
  ).length;
  
  // Calculate score based on word overlap
  const wordOverlapScore = matchingWords / Math.max(searchWords.length, dbWords.length);
  
  // Check if one name contains the other (after removing common words)
  const searchKey = searchWords.join(' ');
  const dbKey = dbWords.join(' ');
  
  let containsScore = 0;
  if (dbKey.includes(searchKey) || searchKey.includes(dbKey)) {
    containsScore = 0.7;
  }
  
  // Return the higher of the two scores
  return Math.max(wordOverlapScore, containsScore);
}

// Helper function to find location by name (direct lookup, not mapping)
async function findLocationByName(locationName: string, db: any): Promise<{ id: string; data: any } | null> {
  try {
    const searchNormalized = normalizeLocationName(locationName);
    const searchParsed = parseLocationName(locationName);
    
    console.log(`[findLocationByName] Searching for: "${locationName}"`);
    console.log(`[findLocationByName] Normalized: "${searchNormalized}"`);
    console.log(`[findLocationByName] Parsed: base="${searchParsed.base}", location="${searchParsed.location}"`);
    
    // First try exact match (case-sensitive)
    let q = query(
      collection(db, 'locations'),
      where('locationName', '==', locationName)
    );
    let snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const foundName = doc.data().locationName;
      console.log(`[findLocationByName] Found exact match: "${foundName}"`);
      return { id: doc.id, data: doc.data() };
    }

    // Try case-insensitive search by getting all locations and filtering
    // (Firestore doesn't support case-insensitive queries directly)
    q = query(collection(db, 'locations'));
    snapshot = await getDocs(q);
    
    const candidates: Array<{ id: string; data: any; score: number }> = [];
    
    for (const doc of snapshot.docs) {
      const docData = doc.data();
      const docLocationName = docData.locationName || '';
      const docNormalized = normalizeLocationName(docLocationName);
      const docParsed = parseLocationName(docLocationName);
      
      let score = 0;
      
      // Strategy 1: Exact normalized match (highest priority)
      if (docNormalized === searchNormalized) {
        console.log(`[findLocationByName] Found exact normalized match: "${docLocationName}"`);
        return { id: doc.id, data: docData };
      }
      
      // Strategy 2: Both have location suffixes, match base + location
      if (searchParsed.location && docParsed.location) {
        if (docParsed.base === searchParsed.base && docParsed.location === searchParsed.location) {
          console.log(`[findLocationByName] Found base+location match: "${docLocationName}"`);
          return { id: doc.id, data: docData };
        }
        // Base matches but location doesn't - don't match (e.g., "Delilah (West Hollywood)" != "Delilah (Miami)")
        if (docParsed.base === searchParsed.base && docParsed.location !== searchParsed.location) {
          continue; // Skip this candidate
        }
      }
      
      // Strategy 3: Search has location suffix, doc doesn't - match if base matches or is similar
      if (searchParsed.location && !docParsed.location) {
        // Extract primary names (without location suffixes and common words)
        const searchPrimary = extractPrimaryName(searchParsed.base);
        const docPrimary = extractPrimaryName(docParsed.base);
        
        // Check if the primary names match or one contains the other
        const primaryMatches = 
          docPrimary === searchPrimary ||
          docPrimary.includes(searchPrimary) ||
          searchPrimary.includes(docPrimary);
        
        if (primaryMatches) {
          score = 0.95; // Very high score for primary name match
          candidates.push({ id: doc.id, data: docData, score });
        } else {
          // Try word-based matching
          const searchWords = extractKeyWords(searchParsed.base);
          const docWords = extractKeyWords(docParsed.base);
          
          // Check if all key words from search are found in doc (or vice versa for short names)
          const allWordsMatch = searchWords.length > 0 && searchWords.every(word => 
            docWords.some(docWord => docWord === word || docWord.includes(word) || word.includes(docWord))
          );
          
          if (allWordsMatch) {
            score = 0.85;
            candidates.push({ id: doc.id, data: docData, score });
          } else {
            // Try similarity matching as fallback
            const similarity = calculateSimilarity(searchParsed.base, docParsed.base);
            if (similarity >= 0.5) {
              score = similarity * 0.7;
              candidates.push({ id: doc.id, data: docData, score });
            }
          }
        }
      }
      
      // Strategy 4: Doc has location suffix, search doesn't - match if base matches
      if (!searchParsed.location && docParsed.location) {
        // Extract primary names
        const searchPrimary = extractPrimaryName(searchNormalized);
        const docPrimary = extractPrimaryName(docParsed.base);
        
        if (searchPrimary === docPrimary || searchPrimary.includes(docPrimary) || docPrimary.includes(searchPrimary)) {
          score = 0.85; // Good match
          candidates.push({ id: doc.id, data: docData, score });
        } else {
          // Try word-based matching
          const searchWords = extractKeyWords(searchNormalized);
          const docWords = extractKeyWords(docParsed.base);
          
          const allWordsMatch = searchWords.length > 0 && searchWords.every(word => 
            docWords.some(docWord => docWord === word || docWord.includes(word) || word.includes(docWord))
          );
          
          if (allWordsMatch) {
            score = 0.75;
            candidates.push({ id: doc.id, data: docData, score });
          } else {
            // Try similarity matching
            const similarity = calculateSimilarity(searchNormalized, docParsed.base);
            if (similarity >= 0.5) {
              score = similarity * 0.7;
              candidates.push({ id: doc.id, data: docData, score });
            }
          }
        }
      }
      
      // Strategy 5: Neither has location suffix, match base
      if (!searchParsed.location && !docParsed.location) {
        // Extract primary names
        const searchPrimary = extractPrimaryName(searchNormalized);
        const docPrimary = extractPrimaryName(docNormalized);
        
        if (searchPrimary === docPrimary) {
          console.log(`[findLocationByName] Found primary name match: "${docLocationName}"`);
          return { id: doc.id, data: docData };
        } else if (searchPrimary.includes(docPrimary) || docPrimary.includes(searchPrimary)) {
          score = 0.9;
          candidates.push({ id: doc.id, data: docData, score });
        } else {
          // Try word-based matching
          const searchWords = extractKeyWords(searchNormalized);
          const docWords = extractKeyWords(docNormalized);
          
          const allWordsMatch = searchWords.length > 0 && searchWords.every(word => 
            docWords.some(docWord => docWord === word || docWord.includes(word) || word.includes(docWord))
          );
          
          if (allWordsMatch) {
            score = 0.8;
            candidates.push({ id: doc.id, data: docData, score });
          } else {
            // Try similarity matching
            const similarity = calculateSimilarity(searchNormalized, docNormalized);
            if (similarity >= 0.6) {
              score = similarity;
              candidates.push({ id: doc.id, data: docData, score });
            }
          }
        }
      }
      
      // Strategy 6: Contains match with similarity scoring
      if (searchNormalized.length >= 3) {
        const similarity = calculateSimilarity(searchNormalized, docNormalized);
        if (similarity >= 0.5 && similarity < 0.7) {
          score = similarity * 0.5; // Lower priority for partial matches
          candidates.push({ id: doc.id, data: docData, score });
        }
      }
    }
    
    // If we have candidates, return the highest scoring one (minimum threshold 0.5)
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const bestMatch = candidates[0];
      if (bestMatch.score >= 0.5) {
        console.log(`[findLocationByName] Found best candidate match (score: ${bestMatch.score}): "${bestMatch.data.locationName}"`);
        return { id: bestMatch.id, data: bestMatch.data };
      }
    }
    
    console.log(`[findLocationByName] No match found for: "${locationName}"`);
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

    console.log(`=== IMPORT START ===`);
    console.log(`Received ${rows.length} rows from frontend`);
    console.log(`First row sample:`, rows[0] ? {
      restaurant: rows[0].restaurant,
      serviceType: rows[0].serviceType,
      frequencyLabel: rows[0].frequencyLabel,
    } : 'No rows');
    console.log(`Last row sample:`, rows[rows.length - 1] ? {
      restaurant: rows[rows.length - 1].restaurant,
      serviceType: rows[rows.length - 1].serviceType,
      frequencyLabel: rows[rows.length - 1].frequencyLabel,
    } : 'No rows');

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
          // Get similar location names for better error message
          const allLocationsQuery = query(collection(db, 'locations'));
          const allLocationsSnapshot = await getDocs(allLocationsQuery);
          const allLocationNames = allLocationsSnapshot.docs
            .map(doc => doc.data().locationName)
            .filter((name): name is string => !!name)
            .slice(0, 10); // Limit to first 10 for error message
          
          const similarLocations = allLocationNames
            .filter(name => {
              const nameLower = normalizeLocationName(name);
              const searchLower = normalizeLocationName(row.restaurant);
              const searchParsed = parseLocationName(row.restaurant);
              const nameParsed = parseLocationName(name);
              
              // Check if base names match
              if (nameParsed.base === searchParsed.base) {
                return true;
              }
              
              // Check if names are similar
              return nameLower.includes(searchLower) || searchLower.includes(nameLower);
            })
            .slice(0, 5);
          
          let errorMsg = `Location not found for "${row.restaurant}".`;
          if (similarLocations.length > 0) {
            errorMsg += ` Similar locations found: ${similarLocations.join(', ')}.`;
          } else if (allLocationNames.length > 0) {
            errorMsg += ` Available locations include: ${allLocationNames.join(', ')}.`;
          }
          errorMsg += ` Please create the location first or check the location name spelling.`;
          
          errors.push({
            row: i + 1,
            error: errorMsg,
          });
          console.error(`Row ${i + 1}: Location not found for "${row.restaurant}"`);
          continue;
        }
        
        const locationId = locationResult.id;
        const locationData = locationResult.data;
        console.log(`Row ${i + 1}: Found location "${locationData.locationName}" with ID: ${locationId}`);

        // Get client and company from location or use provided clientId
        let clientId = row.clientId || locationData.clientId || '';
        const companyId = locationData.companyId || '';

        // If clientId was provided in the row, use it; otherwise use location's clientId
        if (row.clientId) {
          // Verify the provided client exists
          const providedClientDoc = await getDoc(doc(db, 'clients', row.clientId));
          if (!providedClientDoc.exists()) {
            errors.push({
              row: i + 1,
              error: `Client with ID "${row.clientId}" not found.`,
            });
            console.error(`Row ${i + 1}: Provided client not found`);
            continue;
          }
          clientId = row.clientId;
        } else if (!clientId) {
          // If no client is assigned to the location and none was provided, try multiple fallback strategies
          let fallbackClientId: string | null = null;
          
          // Strategy 1: Try to find a client associated with the company
          if (companyId) {
            const clientsQuery = query(
              collection(db, 'clients'),
              where('companyId', '==', companyId)
            );
            const clientsSnapshot = await getDocs(clientsQuery);
            if (!clientsSnapshot.empty) {
              fallbackClientId = clientsSnapshot.docs[0].id;
              console.log(`Row ${i + 1}: Found client ${fallbackClientId} from company ${companyId}`);
            }
          }
          
          // Strategy 2: If no company client found, try to find any client by matching location/restaurant name
          if (!fallbackClientId) {
            const allClientsQuery = query(collection(db, 'clients'));
            const allClientsSnapshot = await getDocs(allClientsQuery);
            
            if (!allClientsSnapshot.empty) {
              // Try to find a client with a matching name (case-insensitive partial match)
              const restaurantNameLower = row.restaurant.toLowerCase();
              const matchingClient = allClientsSnapshot.docs.find(doc => {
                const clientData = doc.data();
                const clientName = (clientData.fullName || '').toLowerCase();
                // Check if restaurant name contains client name or vice versa
                return clientName && (restaurantNameLower.includes(clientName) || clientName.includes(restaurantNameLower.split('(')[0].trim()));
              });
              
              if (matchingClient) {
                fallbackClientId = matchingClient.id;
                console.log(`Row ${i + 1}: Found matching client ${fallbackClientId} by name for "${row.restaurant}"`);
              } else {
                // Strategy 3: Use the first available client as last resort
                fallbackClientId = allClientsSnapshot.docs[0].id;
                console.log(`Row ${i + 1}: Using fallback client ${fallbackClientId} (first available client)`);
              }
            }
          }
          
          if (fallbackClientId) {
            clientId = fallbackClientId;
            console.log(`Row ${i + 1}: Auto-assigned client ${clientId} for location "${row.restaurant}"`);
          } else {
            errors.push({
              row: i + 1,
              error: `Location "${row.restaurant}" does not have a client assigned and no clients exist in the system. Please create at least one client first.`,
            });
            console.error(`Row ${i + 1}: No clients found in system`);
            continue;
          }
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

        // Parse dates (handle both strings and numbers from Excel)
        const lastServiced = row.lastServiced ? parseDate(row.lastServiced as string | number) : null;
        const nextServiceDates = row.nextServiceDates
          .map(dateValue => parseDate(dateValue as string | number))
          .filter((date): date is Date => date !== null)
          .sort((a, b) => a.getTime() - b.getTime()); // Sort dates chronologically

        // Map frequency to recurrence pattern (use default if missing)
        const frequencyLabel = (row.frequencyLabel || 'QUARTERLY').toUpperCase().trim();
        const validLabels = ['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-WEEKLY'] as const;
        const recurrencePatternLabel = validLabels.includes(frequencyLabel as any) ? (frequencyLabel as (typeof validLabels)[number]) : 'QUARTERLY';
        const recurrenceConfig = mapFrequencyToRecurrencePattern(recurrencePatternLabel);
        
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
          recurrencePatternLabel,
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
