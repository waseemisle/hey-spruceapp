import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const PROJECT_ID = 'groundopss';

// All Firestore collections to sync
const COLLECTIONS = [
  'adminUsers',
  'api_tokens',
  'assignedJobs',
  'biddingWorkOrders',
  'categories',
  'clientCharges',
  'clients',
  'companies',
  'emailLogs',
  'invoices',
  'locationMappings',
  'locations',
  'maint_requests',
  'notifications',
  'quotes',
  'recurringWorkOrderExecutions',
  'recurringWorkOrders',
  'scheduled_invoices',
  'subcontractors',
  'users',
  'workOrderNotes',
  'workOrders',
];

// Sign in as admin to get a Firebase ID token for Firestore REST API access
async function signInAdmin(): Promise<{ idToken: string; uid: string }> {
  const email = process.env.FIREBASE_SYNC_EMAIL;
  const password = process.env.FIREBASE_SYNC_PASSWORD;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!email || !password || !apiKey) {
    throw new Error('Missing FIREBASE_SYNC_EMAIL, FIREBASE_SYNC_PASSWORD, or NEXT_PUBLIC_FIREBASE_API_KEY');
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const data = await res.json();
  if (!data.idToken) {
    throw new Error(`Firebase sign-in failed: ${data.error?.message || JSON.stringify(data)}`);
  }
  return { idToken: data.idToken, uid: data.localId };
}

// Parse a Firestore REST API value wrapper into a plain JS value
function parseFirestoreValue(value: any): any {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return {
    latitude: value.geoPointValue.latitude ?? 0,
    longitude: value.geoPointValue.longitude ?? 0,
  };
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(parseFirestoreValue);
  if ('mapValue' in value) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value.mapValue?.fields || {})) {
      obj[k] = parseFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

function parseFirestoreDoc(doc: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    result[key] = parseFirestoreValue(value);
  }
  return result;
}

// Fetch all documents in a Firestore collection via REST API (handles pagination)
async function fetchCollection(
  collectionName: string,
  idToken: string,
): Promise<{ id: string; data: Record<string, any> }[]> {
  const docs: { id: string; data: Record<string, any> }[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`,
    );
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (res.status === 404) break; // collection doesn't exist yet
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore fetch failed for ${collectionName}: ${res.status} ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    for (const doc of data.documents || []) {
      const id = doc.name.split('/').pop();
      docs.push({ id, data: parseFirestoreDoc(doc) });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs;
}

// Look up Firebase Auth user records in batches of 100 using the Identity Toolkit API
// Works with the admin's ID token for users in their own project
async function fetchAuthUsers(
  uids: string[],
  idToken: string,
  apiKey: string,
): Promise<Record<string, any>[]> {
  const users: Record<string, any>[] = [];

  for (let i = 0; i < uids.length; i += 100) {
    const batch = uids.slice(i, i + 100);
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ localId: batch }),
      },
    );

    if (!res.ok) continue;
    const data = await res.json();
    for (const u of data.users || []) {
      users.push({
        uid: u.localId,
        email: u.email || null,
        email_verified: u.emailVerified || false,
        display_name: u.displayName || null,
        phone_number: u.phoneNumber || null,
        photo_url: u.photoUrl || null,
        disabled: u.disabled || false,
        created_at: u.createdAt ? new Date(Number(u.createdAt)).toISOString() : null,
        last_sign_in: u.lastLoginAt ? new Date(Number(u.lastLoginAt)).toISOString() : null,
        last_refresh: u.lastRefreshAt || null,
        provider_data: u.providerUserInfo || [],
        // password_hash is not returned by this endpoint — it is server-side only
      });
    }
  }

  return users;
}

export async function GET(request: Request) {
  // Protect: Vercel cron sends CRON_SECRET as Bearer; manual calls need the same
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const syncedAt = new Date().toISOString();
  const results: Record<string, { synced: number; error?: string }> = {};
  let totalSynced = 0;
  let totalErrors = 0;

  try {
    const { idToken } = await signInAdmin();
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

    // ── 1. Sync all Firestore collections ──────────────────────────────────
    for (const collectionName of COLLECTIONS) {
      try {
        console.log(`[sync] Fetching ${collectionName}...`);
        const docs = await fetchCollection(collectionName, idToken);

        if (docs.length === 0) {
          results[collectionName] = { synced: 0 };
          continue;
        }

        for (let i = 0; i < docs.length; i += 100) {
          const rows = docs.slice(i, i + 100).map(d => ({
            collection_name: collectionName,
            doc_id: d.id,
            data: d.data,
            synced_at: syncedAt,
          }));

          const { error } = await supabase
            .from('firestore_backup')
            .upsert(rows, { onConflict: 'collection_name,doc_id' });

          if (error) throw new Error(error.message);
        }

        results[collectionName] = { synced: docs.length };
        totalSynced += docs.length;
        console.log(`[sync] ${collectionName}: ${docs.length} docs`);
      } catch (err: any) {
        console.error(`[sync] Error on ${collectionName}:`, err.message);
        results[collectionName] = { synced: 0, error: err.message };
        totalErrors++;
      }
    }

    // ── 2. Sync Firebase Auth users ────────────────────────────────────────
    // Collect all UIDs from Firestore (clients + subcontractors + adminUsers)
    try {
      console.log('[sync] Syncing Firebase Auth users...');

      const clientDocs   = await fetchCollection('clients', idToken);
      const subDocs      = await fetchCollection('subcontractors', idToken);
      const adminDocs    = await fetchCollection('adminUsers', idToken);

      // Build a map of uid → role + Firestore data (email, password, etc.)
      const userMap: Record<string, any> = {};

      for (const d of clientDocs) {
        userMap[d.id] = {
          uid: d.id,
          role: 'client',
          email: d.data.email || null,
          full_name: d.data.fullName || null,
          phone: d.data.phone || null,
          company_name: d.data.companyName || null,
          status: d.data.status || null,
          password_plain: d.data.password || null, // plaintext stored for admin view
          firestore_data: d.data,
        };
      }
      for (const d of subDocs) {
        userMap[d.id] = {
          uid: d.id,
          role: 'subcontractor',
          email: d.data.email || null,
          full_name: d.data.fullName || null,
          phone: d.data.phone || null,
          company_name: d.data.businessName || null,
          status: d.data.status || null,
          password_plain: d.data.password || null,
          firestore_data: d.data,
        };
      }
      for (const d of adminDocs) {
        userMap[d.id] = {
          uid: d.id,
          role: 'admin',
          email: d.data.email || null,
          full_name: d.data.fullName || null,
          phone: d.data.phone || null,
          company_name: null,
          status: 'approved',
          password_plain: d.data.password || null,
          firestore_data: d.data,
        };
      }

      const allUids = Object.keys(userMap);
      console.log(`[sync] Total UIDs to look up in Auth: ${allUids.length}`);

      // Augment with Firebase Auth metadata (emailVerified, lastSignInAt, etc.)
      const authUsers = await fetchAuthUsers(allUids, idToken, apiKey);
      const authByUid: Record<string, any> = {};
      for (const u of authUsers) authByUid[u.uid] = u;

      // Merge and upsert into firebase_auth_users table
      const rows = allUids.map(uid => ({
        uid,
        role: userMap[uid].role,
        email: userMap[uid].email,
        full_name: userMap[uid].full_name,
        phone: userMap[uid].phone,
        company_name: userMap[uid].company_name,
        status: userMap[uid].status,
        password_plain: userMap[uid].password_plain,
        email_verified: authByUid[uid]?.email_verified ?? false,
        disabled: authByUid[uid]?.disabled ?? false,
        created_at_auth: authByUid[uid]?.created_at ?? null,
        last_sign_in: authByUid[uid]?.last_sign_in ?? null,
        provider_data: authByUid[uid]?.provider_data ?? [],
        firestore_data: userMap[uid].firestore_data,
        synced_at: syncedAt,
      }));

      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase
          .from('firebase_auth_users')
          .upsert(rows.slice(i, i + 100), { onConflict: 'uid' });
        if (error) throw new Error(error.message);
      }

      results['firebase_auth_users'] = { synced: rows.length };
      totalSynced += rows.length;
      console.log(`[sync] firebase_auth_users: ${rows.length} users synced`);
    } catch (err: any) {
      console.error('[sync] Error syncing auth users:', err.message);
      results['firebase_auth_users'] = { synced: 0, error: err.message };
      totalErrors++;
    }

    // ── 3. Log this sync run ───────────────────────────────────────────────
    await supabase.from('sync_log').insert({
      synced_at: syncedAt,
      total_synced: totalSynced,
      total_errors: totalErrors,
      results,
    }).then(({ error }) => {
      if (error) console.error('[sync] sync_log insert error:', error.message);
    });

    return NextResponse.json({
      success: true,
      totalSynced,
      totalErrors,
      syncedAt,
      results,
    });
  } catch (err: any) {
    console.error('[sync] Fatal error:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
