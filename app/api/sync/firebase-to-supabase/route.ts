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

// Refresh OAuth token using stored refresh token
async function getAccessToken(): Promise<string> {
  const refreshToken = process.env.FIREBASE_REFRESH_TOKEN;
  const clientId = process.env.FIREBASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.FIREBASE_OAUTH_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing FIREBASE_REFRESH_TOKEN, FIREBASE_OAUTH_CLIENT_ID, or FIREBASE_OAUTH_CLIENT_SECRET env vars');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// Parse a Firestore REST API value wrapper into a plain JS value
function parseFirestoreValue(value: any): any {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue; // ISO string
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return {
    latitude: value.geoPointValue.latitude ?? 0,
    longitude: value.geoPointValue.longitude ?? 0,
  };
  if ('arrayValue' in value) {
    return (value.arrayValue?.values || []).map(parseFirestoreValue);
  }
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
  accessToken: string,
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
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) {
      // Collection doesn't exist yet — skip silently
      break;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore fetch failed for ${collectionName}: ${res.status} ${errText}`);
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

export async function GET(request: Request) {
  // Allow Vercel cron (which sends CRON_SECRET as Bearer) or manual call with the same secret
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
    const accessToken = await getAccessToken();

    for (const collectionName of COLLECTIONS) {
      try {
        console.log(`[sync] Fetching collection: ${collectionName}`);
        const docs = await fetchCollection(collectionName, accessToken);

        if (docs.length === 0) {
          results[collectionName] = { synced: 0 };
          continue;
        }

        // Upsert in batches of 100 to stay within Supabase limits
        const BATCH_SIZE = 100;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const batch = docs.slice(i, i + BATCH_SIZE);
          const rows = batch.map(d => ({
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
        console.log(`[sync] ${collectionName}: ${docs.length} docs synced`);
      } catch (err: any) {
        console.error(`[sync] Error on ${collectionName}:`, err.message);
        results[collectionName] = { synced: 0, error: err.message };
        totalErrors++;
      }
    }

    // Write to sync_log table
    await supabase.from('sync_log').insert({
      synced_at: syncedAt,
      total_synced: totalSynced,
      total_errors: totalErrors,
      results,
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
