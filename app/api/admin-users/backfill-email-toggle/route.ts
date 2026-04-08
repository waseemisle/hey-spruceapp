import { NextResponse } from 'next/server';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export async function POST() {
  try {
    const db = await getServerDb();
    const snapshot = await getDocs(collection(db, 'adminUsers'));

    let updated = 0;
    let alreadySet = 0;
    const details: { email: string; action: string }[] = [];

    for (const adminDoc of snapshot.docs) {
      const data = adminDoc.data();
      if (data.workOrderEmailNotifications === undefined || data.workOrderEmailNotifications === null) {
        await updateDoc(doc(db, 'adminUsers', adminDoc.id), {
          workOrderEmailNotifications: true,
        });
        updated++;
        details.push({ email: data.email || adminDoc.id, action: 'set to true (was missing)' });
      } else {
        alreadySet++;
        details.push({ email: data.email || adminDoc.id, action: `already ${data.workOrderEmailNotifications}` });
      }
    }

    return NextResponse.json({
      success: true,
      total: snapshot.docs.length,
      updated,
      alreadySet,
      details,
    });
  } catch (error: any) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
