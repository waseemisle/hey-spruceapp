import { NextResponse } from 'next/server';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates an assignedJobs record server-side (bypassing Firestore client rules
 * that restrict clients from writing to assignedJobs).
 * Called by the client portal when a client approves a quote.
 */
export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workOrderId, subcontractorId } = await request.json();
    if (!workOrderId || !subcontractorId) {
      return NextResponse.json({ error: 'Missing workOrderId or subcontractorId' }, { status: 400 });
    }

    const db = await getServerDb();
    const docRef = await addDoc(collection(db, 'assignedJobs'), {
      workOrderId,
      subcontractorId,
      assignedAt: serverTimestamp(),
      status: 'pending_acceptance',
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('Error creating assignedJob:', error);
    return NextResponse.json({ error: error.message || 'Failed to create assigned job' }, { status: 500 });
  }
}
