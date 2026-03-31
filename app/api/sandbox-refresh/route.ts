import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { getStagingFirestore, isStagingConfigured } from '@/lib/firebase-staging-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
import { SYNC_COLLECTIONS, SUBCOLLECTIONS } from '@/lib/sandbox-config';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH_SIZE = 499;

async function deleteInBatches(
  db: Firestore,
  docs: QueryDocumentSnapshot<DocumentData>[],
) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

async function writeInBatches(
  db: Firestore,
  collectionName: string,
  docs: { id: string; data: DocumentData }[],
) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach(({ id, data }) => {
      batch.set(db.collection(collectionName).doc(id), data);
    });
    await batch.commit();
  }
}

async function writeSubInBatches(
  db: Firestore,
  parent: string,
  parentId: string,
  sub: string,
  docs: { id: string; data: DocumentData }[],
) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach(({ id, data }) => {
      batch.set(db.collection(parent).doc(parentId).collection(sub).doc(id), data);
    });
    await batch.commit();
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    // 1. Verify admin
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const prodDb = getAdminFirestore();

    const adminDoc = await prodDb.collection('adminUsers').doc(decodedToken.uid).get();
    if (!adminDoc.exists) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // 2. Check staging credentials
    if (!isStagingConfigured()) {
      return NextResponse.json(
        {
          error:
            'Staging Firebase not configured. Add STAGING_FIREBASE_PROJECT_ID, ' +
            'STAGING_FIREBASE_CLIENT_EMAIL, and STAGING_FIREBASE_PRIVATE_KEY to ' +
            'Vercel Production environment variables.',
        },
        { status: 400 },
      );
    }

    const stagingDb = getStagingFirestore();
    const adminData = adminDoc.data()!;

    // 3. Use client-provided jobId so the client can listen to it in real time
    const body = await request.json().catch(() => ({}));
    const jobId: string = body.jobId || prodDb.collection('sandboxRefreshHistory').doc().id;
    const historyRef = prodDb.collection('sandboxRefreshHistory').doc(jobId);

    await historyRef.set({
      id: jobId,
      triggeredBy: {
        uid: decodedToken.uid,
        email: decodedToken.email || adminData.email || '',
        displayName: adminData.fullName || decodedToken.name || decodedToken.email || '',
      },
      startedAt: FieldValue.serverTimestamp(),
      status: 'running',
      currentCollection: '',
      stats: {},
      totalDocumentsCopied: 0,
      completedCollections: 0,
      totalCollections: SYNC_COLLECTIONS.length,
      error: null,
    });

    let totalDocumentsCopied = 0;
    const stats: Record<string, { copied: number; deleted: number; error?: string }> = {};

    // 4. Sync each collection
    for (const collectionName of SYNC_COLLECTIONS) {
      await historyRef.update({ currentCollection: collectionName });

      try {
        // Read from production
        const prodSnap = await prodDb.collection(collectionName).get();
        const prodDocs = prodSnap.docs.map(d => ({ id: d.id, data: d.data() }));

        // Read subcollection data from production (if any)
        const subcollectionNames = SUBCOLLECTIONS[collectionName] ?? [];
        const subData: Record<string, Record<string, { id: string; data: DocumentData }[]>> = {};

        if (subcollectionNames.length > 0) {
          for (const parentDoc of prodSnap.docs) {
            subData[parentDoc.id] = {};
            for (const subName of subcollectionNames) {
              const subSnap = await prodDb
                .collection(collectionName)
                .doc(parentDoc.id)
                .collection(subName)
                .get();
              if (!subSnap.empty) {
                subData[parentDoc.id][subName] = subSnap.docs.map(d => ({
                  id: d.id,
                  data: d.data(),
                }));
              }
            }
          }
        }

        // Clear staging (delete subcollections first to avoid orphans)
        const stagingSnap = await stagingDb.collection(collectionName).get();

        if (subcollectionNames.length > 0 && !stagingSnap.empty) {
          for (const stagingParent of stagingSnap.docs) {
            for (const subName of subcollectionNames) {
              const stagingSubSnap = await stagingDb
                .collection(collectionName)
                .doc(stagingParent.id)
                .collection(subName)
                .get();
              await deleteInBatches(stagingDb, stagingSubSnap.docs);
            }
          }
        }

        const deletedCount = stagingSnap.size;
        await deleteInBatches(stagingDb, stagingSnap.docs);

        // Write production docs to staging
        await writeInBatches(stagingDb, collectionName, prodDocs);

        // Write subcollection docs to staging
        for (const [parentId, subs] of Object.entries(subData)) {
          for (const [subName, subDocs] of Object.entries(subs)) {
            await writeSubInBatches(stagingDb, collectionName, parentId, subName, subDocs);
          }
        }

        stats[collectionName] = { copied: prodDocs.length, deleted: deletedCount };
        totalDocumentsCopied += prodDocs.length;

        await historyRef.update({
          [`stats.${collectionName}`]: { copied: prodDocs.length, deleted: deletedCount },
          completedCollections: FieldValue.increment(1),
          totalDocumentsCopied: FieldValue.increment(prodDocs.length),
        });
      } catch (collErr: any) {
        console.error(`[sandbox-refresh] Error syncing ${collectionName}:`, collErr.message);
        stats[collectionName] = { copied: -1, deleted: 0, error: collErr.message };
        await historyRef.update({
          [`stats.${collectionName}`]: { copied: -1, deleted: 0, error: collErr.message },
          completedCollections: FieldValue.increment(1),
        });
      }
    }

    const duration = Math.round((Date.now() - startedAt) / 1000);

    // 5. Mark complete
    await historyRef.update({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      currentCollection: '',
      duration,
      totalDocumentsCopied,
      stats,
    });

    return NextResponse.json({ success: true, id: jobId, totalDocumentsCopied, duration, stats });
  } catch (err: any) {
    console.error('[sandbox-refresh] Fatal error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
