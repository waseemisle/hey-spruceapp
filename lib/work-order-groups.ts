import {
  Firestore,
  WriteBatch,
  addDoc,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

export type WorkOrderGroupActor = {
  uid: string;
  role: 'admin' | 'client';
};

export type CombineEligibleWorkOrder = {
  id: string;
  clientId: string;
  companyId?: string | null;
  locationId?: string | null;
  status?: string | null;
  workOrderGroupId?: string | null;
  approvedQuoteId?: string | null;
};

export type WorkOrderGroupDoc = {
  id: string;
  createdAt: unknown;
  createdBy: { uid: string; role: 'admin' | 'client' };
  clientId: string;
  companyId: string | null;
  workOrderIds: string[];
  primaryWorkOrderId: string;
};

export function validateWorkOrdersForCombine(workOrders: CombineEligibleWorkOrder[]) {
  if (workOrders.length < 2) {
    return { ok: false as const, error: 'Select at least 2 work orders to combine.' };
  }
  const clientIds = new Set(workOrders.map((w) => w.clientId).filter(Boolean));
  if (clientIds.size !== 1) {
    return { ok: false as const, error: 'All selected work orders must belong to the same client.' };
  }
  const companyIds = new Set(workOrders.map((w) => w.companyId ?? null));
  if (companyIds.size > 1) {
    return { ok: false as const, error: 'All selected work orders must belong to the same company.' };
  }
  const locationIds = new Set(workOrders.map((w) => w.locationId ?? null));
  if (locationIds.size > 1) {
    return { ok: false as const, error: 'All selected work orders must belong to the same location.' };
  }
  const alreadyGrouped = workOrders.find((w) => !!w.workOrderGroupId);
  if (alreadyGrouped) {
    return { ok: false as const, error: 'One or more selected work orders is already part of a combined group.' };
  }
  const alreadyApproved = workOrders.find((w) => !!w.approvedQuoteId);
  if (alreadyApproved) {
    return { ok: false as const, error: 'One or more selected work orders already has an approved quote.' };
  }
  const disallowed = new Set(['archived', 'completed', 'assigned', 'accepted_by_subcontractor', 'pending_invoice']);
  const badStatus = workOrders.find((w) => (w.status ? disallowed.has(w.status) : false));
  if (badStatus) {
    return { ok: false as const, error: 'One or more selected work orders is not eligible to combine in its current status.' };
  }
  return { ok: true as const };
}

function addWorkOrderGroupUpdates(params: {
  db: Firestore;
  batch: WriteBatch;
  groupId: string;
  workOrderIds: string[];
  primaryWorkOrderId: string;
}) {
  const { db, batch, groupId, workOrderIds, primaryWorkOrderId } = params;
  for (const id of workOrderIds) {
    const isPrimary = id === primaryWorkOrderId;
    batch.update(doc(db, 'workOrders', id), {
      workOrderGroupId: groupId,
      isCombinedPrimary: isPrimary,
      isCombinedChild: !isPrimary,
      combinedPrimaryWorkOrderId: primaryWorkOrderId,
      updatedAt: serverTimestamp(),
      // Light-touch metadata to support list display without loading the group doc.
      combinedWorkOrderCount: workOrderIds.length,
    });
  }
}

export async function createWorkOrderGroup(params: {
  db: Firestore;
  actor: WorkOrderGroupActor;
  workOrders: CombineEligibleWorkOrder[];
  primaryWorkOrderId?: string;
}) {
  const { db, actor, workOrders } = params;
  const validation = validateWorkOrdersForCombine(workOrders);
  if (!validation.ok) {
    return { ok: false as const, error: validation.error };
  }

  const workOrderIds = workOrders.map((w) => w.id);
  const primaryWorkOrderId = params.primaryWorkOrderId && workOrderIds.includes(params.primaryWorkOrderId)
    ? params.primaryWorkOrderId
    : workOrderIds[0];

  const clientId = workOrders[0].clientId;
  const companyId = (workOrders[0].companyId ?? null) as string | null;

  const groupRef = await addDoc(collection(db, 'workOrderGroups'), {
    createdAt: serverTimestamp(),
    createdBy: { uid: actor.uid, role: actor.role },
    clientId,
    companyId,
    workOrderIds,
    primaryWorkOrderId,
  } satisfies Omit<WorkOrderGroupDoc, 'id'>);

  const groupId = groupRef.id;

  const batch = writeBatch(db);
  // Store id in-doc for easier exports / denormalized reads.
  batch.update(groupRef, { id: groupId, updatedAt: serverTimestamp() });
  addWorkOrderGroupUpdates({ db, batch, groupId, workOrderIds, primaryWorkOrderId });
  await batch.commit();

  return {
    ok: true as const,
    groupId,
    primaryWorkOrderId,
    workOrderIds,
    clientId,
    companyId,
  };
}

