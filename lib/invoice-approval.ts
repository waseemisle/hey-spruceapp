/**
 * Invoice Approval (72h) — shared helpers.
 *
 * Workflow: when a client's company has `invoiceApprovalRequired === true`,
 * generated invoices enter a pending state. The client has 72h from the
 * invoice's createdAt to approve or dispute. If neither happens, an
 * hourly cron auto-finalizes and emails the invoice.
 *
 * Decisions locked into this module (rev. 1):
 *   - Clock starts at invoices.createdAt (deterministic, simplest).
 *   - Deadline stored as a UTC absolute Timestamp; client UI converts to local.
 *   - Stripe payment link is created at draft (current behavior preserved).
 *   - Dispute pauses auto-finalize and notifies admins.
 *   - v1: a single email is sent at approve / auto-finalize. No reminder.
 */
import { Firestore, doc, getDoc } from 'firebase/firestore';

export const APPROVAL_WINDOW_HOURS = 72;
export const APPROVAL_WINDOW_MS = APPROVAL_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * Look up the client → company → invoiceApprovalRequired chain.
 * Returns false on missing client, missing company, or any read failure
 * (fail-open keeps current immediate-send behavior on error).
 */
export async function isInvoiceApprovalRequiredForClient(
  clientId: string,
  db: Firestore,
): Promise<{ required: boolean; companyId: string | null }> {
  if (!clientId) return { required: false, companyId: null };
  try {
    const clientSnap = await getDoc(doc(db, 'clients', clientId));
    if (!clientSnap.exists()) return { required: false, companyId: null };
    const companyId = (clientSnap.data().companyId as string | undefined) || null;
    if (!companyId) return { required: false, companyId: null };
    const companySnap = await getDoc(doc(db, 'companies', companyId));
    if (!companySnap.exists()) return { required: false, companyId };
    const required = companySnap.data().invoiceApprovalRequired === true;
    return { required, companyId };
  } catch (error) {
    console.error('[invoice-approval] lookup failed; defaulting to disabled:', error);
    return { required: false, companyId: null };
  }
}

/** Compute approvalDeadlineAt = createdAt + 72h. */
export function computeApprovalDeadline(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + APPROVAL_WINDOW_MS);
}
