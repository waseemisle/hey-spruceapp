/**
 * Centralized rule for "can the admin still add subcontractors to this
 * work order's bidding pool?".
 *
 * Product rule (per spec):
 *   Bidding stays open until the client APPROVES a quote, OR the work
 *   order reaches an explicit terminal state (cancelled / rejected /
 *   archived / completed). Until then, ops can keep widening the
 *   bidder pool — including BEFORE first share (status 'approved'),
 *   DURING bidding ('bidding'), and AFTER quotes have arrived but
 *   nothing's been accepted yet ('quotes_received',
 *   'diagnostic_accepted', 'repair_approved', 'repair_declined').
 *
 * What flips the door closed:
 *   • status moves to 'assigned' / 'accepted_by_subcontractor' /
 *     'scheduled' (a sub is now doing the work)
 *   • status moves to 'completed' / 'pending_invoice' (job is done)
 *   • status moves to 'rejected' / 'cancelled' / 'archived' (terminal)
 *   • approvedQuoteId is set on the WO (defensive — covers the case
 *     where status hasn't yet been flipped server-side)
 */
export interface WorkOrderForBiddingEligibility {
  status?: string;
  approvedQuoteId?: string;
  assignedTo?: string;
  assignedSubcontractor?: string;
}

/** Statuses that are still "in the bidding window" and accept new bidders. */
export const BIDDING_OPEN_STATUSES: ReadonlySet<string> = new Set([
  'pending',                // not yet admin-approved, but admin can pre-share
  'approved',               // ready to share for the first time
  'bidding',                // already shared, no quotes yet
  'quotes_received',        // some quotes arrived, none accepted
  'diagnostic_accepted',    // diagnostic phase done, repair quotes still open
  'repair_approved',        // client approved a repair phase, more bidders OK
  'repair_declined',        // client declined repair, can re-shop
]);

/** Statuses where bidding is closed — adding subs would be confusing. */
export const BIDDING_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  'assigned',
  'accepted_by_subcontractor',
  'rejected_by_subcontractor', // sub bailed; admin should re-assign, not re-bid
  'scheduled',
  'diagnostic_submitted',      // sub returned diagnostic, awaiting client decision
  'pending_invoice',
  'completed',
  'cancelled',
  'rejected',
  'archived',
]);

export function canAddBidders(workOrder: WorkOrderForBiddingEligibility | null | undefined): boolean {
  if (!workOrder) return false;
  // If a quote was approved on the WO, bidding is closed regardless of
  // status (defensive — status updates can lag the approval write).
  if (workOrder.approvedQuoteId) return false;
  // Same defense if a sub got assigned without status catching up.
  if (workOrder.assignedTo || workOrder.assignedSubcontractor) return false;

  const status = (workOrder.status || '').toLowerCase();
  if (BIDDING_CLOSED_STATUSES.has(status)) return false;
  // Default: allow if explicitly in the open set, OR unknown status (be
  // permissive rather than block ops on a status we haven't catalogued).
  return BIDDING_OPEN_STATUSES.has(status) || !BIDDING_CLOSED_STATUSES.has(status);
}

/**
 * Has this WO ever been shared for bidding? Used to switch the button
 * label between "Share for Bidding" (first share) and "Add Bidders"
 * (extending an existing pool).
 */
export function hasBeenSharedForBidding(workOrder: { status?: string; biddingSubcontractors?: string[] } | null | undefined): boolean {
  if (!workOrder) return false;
  if (Array.isArray(workOrder.biddingSubcontractors) && workOrder.biddingSubcontractors.length > 0) return true;
  const status = (workOrder.status || '').toLowerCase();
  return status === 'bidding' || status === 'quotes_received';
}
