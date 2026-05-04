/**
 * Per-client internal admin-approval gate for invoices.
 *
 * Configuration:
 *   clients/{id}.requireInvoiceApproval  (boolean)
 *
 * When true, every invoice created for this client is born in
 * 'pending_approval' state with NO client-side email / notification.
 * An admin must click "Approve & notify client" on the admin invoices
 * page before the customer is contacted. Distinct from the company-
 * level 72h client-side approval (companies.invoiceApprovalRequired)
 * which is the OTHER side of the same status enum.
 *
 * Used by:
 *   • app/admin-portal/work-orders/page.tsx (handleSendInvoice)
 *   • app/admin-portal/scheduled-invoices/page.tsx (executeNow)
 *   • app/admin-portal/invoices/page.tsx + [id]/page.tsx (manual create / Mark as sent)
 *   • app/api/recurring-work-orders/execute/route.ts (cron)
 *   • Quote → invoice flows
 */
import { doc, getDoc, type Firestore } from 'firebase/firestore';

/**
 * Returns true when the given client has the per-client admin-approval
 * gate enabled. Always returns false (open) on lookup failure — better
 * to over-send than to silently block client comms on transient errors.
 */
export async function shouldRequireAdminApproval(
  db: Firestore,
  clientId: string | undefined | null,
): Promise<boolean> {
  if (!clientId) return false;
  try {
    const snap = await getDoc(doc(db, 'clients', clientId));
    if (!snap.exists()) return false;
    return snap.data().requireInvoiceApproval === true;
  } catch (err) {
    console.warn('[admin-invoice-approval] lookup failed for', clientId, err);
    return false;
  }
}
