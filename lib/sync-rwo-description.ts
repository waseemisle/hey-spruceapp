import {
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

const TERMINAL_WO_STATUSES = new Set([
  'completed',
  'archived',
  'rejected',
  'diagnostic_rejected',
  'repair_declined',
]);

/**
 * Push a recurring-work-order description edit down to every spawned
 * work order that is still in flight (anything not in a terminal status).
 *
 * Why: subs view the spawned WorkOrder doc, not the parent RWO. If the
 * client/admin updates the RWO description after a WO has been spawned
 * and assigned, the sub will keep seeing the stale text on their job.
 */
export async function syncRwoDescriptionToActiveWorkOrders(
  db: Firestore,
  recurringWorkOrderId: string,
  newDescription: string
): Promise<{ updated: number }> {
  const snap = await getDocs(
    query(
      collection(db, 'workOrders'),
      where('recurringWorkOrderId', '==', recurringWorkOrderId)
    )
  );

  const targets = snap.docs.filter((d) => {
    const status = (d.data().status || '') as string;
    return !TERMINAL_WO_STATUSES.has(status);
  });

  await Promise.all(
    targets.map((d) =>
      updateDoc(d.ref, {
        description: newDescription,
        descriptionUpdatedAt: serverTimestamp(),
      })
    )
  );

  return { updated: targets.length };
}
