// User Types
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'client' | 'subcontractor';
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  companyId?: string;
  phone: string;
  address?: Address;
  assignedLocations?: string[]; // Array of location IDs the client has access to
  password?: string; // Password stored for admin viewing (view-only)
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Stripe billing fields
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  savedCardLast4?: string;
  savedCardBrand?: string;
  savedCardExpMonth?: number;
  savedCardExpYear?: number;
  autoPayEnabled?: boolean;
  // Fixed recurring subscription
  stripeSubscriptionId?: string;
  subscriptionAmount?: number;
  subscriptionBillingDay?: number; // day of month (1-31)
  subscriptionStatus?: 'active' | 'paused' | 'cancelled';
  subscriptionPaymentMethodId?: string;
  // Consolidated billing
  paymentTermsDays?: number; // billing cycle in days (e.g. 15, 30)
  autoChargeThreshold?: number; // auto-charge when consolidated invoice exceeds this
  /**
   * Per-client internal-approval gate. When true, every invoice generated
   * for this client is created in 'pending_approval' state with NO client
   * email or notification. An admin must click "Approve & notify client"
   * on the admin invoices page before the customer is contacted. Distinct
   * from the company-level invoiceApprovalRequired (72h client-side
   * approval window) — this is admin-side review.
   */
  requireInvoiceApproval?: boolean;
}

export interface SubcontractorBankAccount {
  bankName: string;
  accountHolderName: string;
  accountType: 'checking' | 'savings';
  routingNumber: string;        // 9-digit ABA routing number
  accountNumberLast4: string;   // only last 4 digits stored in plain text
  accountNumberEncrypted: string; // full account number (base64-encoded for basic obfuscation)
  addedAt: Date | any;
  updatedAt: Date | any;
}

export interface Subcontractor {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  phone: string;
  skills: string[];
  licenseNumber?: string;
  insuranceInfo?: any;
  password?: string; // Password stored for admin viewing (view-only)
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  bankAccount?: SubcontractorBankAccount;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUser {
  uid: string;
  email: string;
  fullName: string;
  role: 'admin';
  createdAt: Date;
  workOrderEmailNotifications?: boolean;
  supportTicketEmailNotifications?: boolean;
}

// Address Type
export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

// Location Types
export interface Location {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  companyId: string;
  companyName: string;
  locationName: string;
  address: Address;
  propertyType: string;
  contactPerson: string;
  contactPhone: string;
  /**
   * Per-location billing/notification email (Invoice Location Email
   * feature). Used when the parent company has invoiceLocationEmailEnabled.
   */
  locationEmail?: string;
  /**
   * Per-location Margin Edge AP inbox. Used when the parent company has
   * marginEdgeEnabled. Falls back to company.marginEdgeInvoiceEmail when
   * empty (admin can configure a default at the company and override
   * per-location). The Margin Edge forward fires on admin Approve (not
   * on customer-facing send).
   */
  marginEdgeEmail?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Company Types
export interface Company {
  id: string;
  clientId: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  address?: Address;
  createdAt: Date;
  updatedAt: Date;
}

// Keep Subsidiary as alias for backward compatibility
export type Subsidiary = Company;

// Category Types
export interface Category {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
}

// Work Order Types
export interface WorkOrderTimelineEvent {
  id: string;
  timestamp: Date | any;
  type: 'created' | 'approved' | 'rejected' | 'shared_for_bidding' | 'quote_received' |
        'quote_shared_with_client' | 'quote_approved_by_client' | 'quote_rejected_by_client' |
        'assigned' | 'schedule_set' | 'schedule_shared' | 'started' | 'completed' |
        'invoice_sent' | 'invoice_pending_approval' | 'invoice_paid' | 'payment_received' | 'archived' |
        'diagnostic_request_received' | 'diagnostic_accepted' | 'diagnostic_rejected' |
        'diagnostic_submitted' | 'repair_approved' | 'repair_declined';
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}

export interface WorkOrderSystemInformation {
  createdBy?: { id: string; name: string; role: string; timestamp: Date | any };
  approvedBy?: { id: string; name: string; timestamp: Date | any };
  rejectedBy?: { id: string; name: string; timestamp: Date | any; reason: string };
  sharedForBidding?: {
    by: { id: string; name: string };
    timestamp: Date | any;
    subcontractors: Array<{ id: string; name: string }>;
  };
  quotesReceived?: Array<{
    quoteId: string;
    subcontractorId: string;
    subcontractorName: string;
    amount: number;
    timestamp: Date | any;
  }>;
  quoteSharedWithClient?: {
    quoteId: string;
    by: { id: string; name: string };
    timestamp: Date | any;
  };
  quoteApprovalByClient?: {
    quoteId: string;
    approvedBy: { id: string; name: string };
    timestamp: Date | any;
  };
  assignment?: {
    subcontractorId: string;
    subcontractorName: string;
    assignedBy: { id: string; name: string };
    timestamp: Date | any;
  };
  scheduledService?: {
    date: Date | any;
    time: string;
    setBy: { id: string; name: string };
    sharedWithClientAt?: Date | any;
  };
  completion?: {
    completedBy: { id: string; name: string };
    timestamp: Date | any;
    notes: string;
  };
  invoicing?: {
    sentAt: Date | any;
    sentBy: { id: string; name: string };
    paidAt?: Date | any;
  };
  archivedBy?: { id: string; name: string; role: string; timestamp: Date | any };
}

export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  appyRequestor?: string; // APPY Requestor field - stores the requestor from maintenance API requests
  locationId: string;
  location: Location;
  title: string;
  description: string;
  category: string;
  categoryId: string;
  priority: 'low' | 'medium' | 'high';
  status:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'bidding'
    | 'quote_received'
    | 'quotes_received'
    | 'diagnostic_accepted'
    | 'diagnostic_rejected'
    | 'assigned'
    | 'accepted_by_subcontractor'
    | 'diagnostic_submitted'
    | 'repair_approved'
    | 'repair_declined'
    | 'in-progress'
    | 'pending_invoice'
    | 'completed'
    | 'archived';
  images: string[];
  assignedTo?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedAt?: Date;
  scheduledServiceDate?: Date;
  scheduledServiceTime?: string;
  completedAt?: Date;
  completionNotes?: string;
  completionDetails?: string;
  completionImages?: string[];
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  // Diagnostic → Repair workflow
  diagnosticFee?: number;
  diagnosticNotes?: string;
  diagnosticSubmittedAt?: Date;
  repairApprovedAt?: Date;
  repairDeclinedAt?: Date;
  /** Which fee the invoice should bill: 'diagnostic' (client declined repair) or 'repair' (client approved repair). */
  billingPhase?: 'diagnostic' | 'repair';
  timeline?: WorkOrderTimelineEvent[];
  systemInformation?: WorkOrderSystemInformation;
  createdAt: Date;
  updatedAt: Date;
}

export interface BiddingWorkOrder {
  workOrderId: string;
  workOrderNumber: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  workOrderTitle: string;
  workOrderDescription: string;
  workOrderLocation: Location;
  clientId: string;
  clientName: string;
  status: 'pending' | 'quote_submitted';
  sharedAt: Date;
  createdAt: Date;
}

// Quote Types
export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export type QuoteTimelineEventType = 'created' | 'sent_to_client' | 'accepted' | 'rejected';

export interface QuoteTimelineEvent {
  id: string;
  timestamp: Date | any;
  type: QuoteTimelineEventType;
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}

export interface QuoteSystemInformation {
  createdBy?: { id: string; name: string; role: string; timestamp: Date | any };
  sentToClientBy?: { id: string; name: string; timestamp: Date | any };
  acceptedBy?: { id: string; name: string; timestamp: Date | any };
  rejectedBy?: { id: string; name: string; timestamp: Date | any; reason?: string };
}

export interface Quote {
  id: string;
  workOrderId: string;
  biddingWorkOrderId?: string;
  workOrderNumber: string;
  workOrderTitle: string;
  workOrderDescription: string;
  workOrderLocation: Location;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  discountAmount: number;
  totalAmount: number;
  originalAmount: number;
  clientAmount: number;
  markupPercentage: number;
  lineItems: LineItem[];
  notes: string;
  terms: string;
  validUntil: Date;
  proposedServiceDate?: Date; // Date subcontractor can perform the work
  proposedServiceTime?: string; // Time subcontractor can perform the work (e.g., "2:00 PM")
  estimatedDuration?: string; // Estimated duration (e.g., "2-3 days")
  status: 'pending' | 'accepted' | 'rejected' | 'sent_to_client' | 'invoiced';
  isBiddingWorkOrder: boolean;
  acceptedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  timeline?: QuoteTimelineEvent[];
  systemInformation?: QuoteSystemInformation;
  /** How this quote was created (e.g. subcontractor_bidding, admin_portal) */
  creationSource?: 'subcontractor_bidding' | 'admin_portal' | 'diagnostic_submission' | 'repair_quote';
  // Diagnostic → Repair workflow
  /** True when this quote represents the diagnostic visit only (not a repair). */
  isDiagnosticQuote?: boolean;
  /** Diagnostic fee captured on this quote (mirrors workOrder.diagnosticFee). */
  diagnosticFee?: number;
  /** Links the follow-up repair quote back to the original diagnostic quote. */
  repairQuoteId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Invoice Types
export type InvoiceTimelineEventType = 'created' | 'sent' | 'paid' | 'failed';

export interface InvoiceTimelineEvent {
  id: string;
  timestamp: Date | any;
  type: InvoiceTimelineEventType;
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}

export interface InvoiceSystemInformation {
  createdBy?: { id: string; name: string; role: string; timestamp: Date | any };
  sentBy?: { id: string; name: string; timestamp: Date | any };
  paidAt?: Date | any;
  paidBy?: { id: string; name: string; timestamp: Date | any };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  quoteId: string;
  workOrderId: string;
  workOrderTitle: string;
  workOrderDescription: string;
  workOrderLocation: Location;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  /**
   * Invoice lifecycle. Note for filters / UI:
   *  - 'pending_approval' is overloaded: covers BOTH the company-level 72h
   *                client-side approval (gated by company.invoiceApprovalRequired)
   *                AND the per-client internal admin approval (gated by
   *                client.requireInvoiceApproval). The two are distinguished
   *                by the audit fields below — clientApprovalStatus tracks
   *                client side, adminApprovalRequired/adminApprovedAt track
   *                admin side.
   *  - 'approved'  set when an admin clicks "Approve & Forward" on a draft.
   *                Triggers the Margin Edge forward (per-location address
   *                with company-level fallback) when the company has
   *                marginEdgeEnabled. Independent of the customer-facing
   *                send — admin still clicks "Send" to email the client.
   *  - 'expired'   set by the Stripe webhook when a Checkout session expires
   *                without payment (handleExpiredPayment).
   *  - 'cancelled' / 'void' reserved for explicit admin-initiated kill of an
   *                invoice (no UI for this yet — included in the union so
   *                future code paths and rule-based filters compile cleanly).
   *  - The duplicate-invoice guard in handleSendInvoice / executeNow
   *    treats expired / cancelled / void as terminal and ALLOWS a new
   *    invoice to be created against the same work order or schedule.
   */
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'paid' | 'overdue' | 'disputed' | 'expired' | 'cancelled' | 'void';
  /** When the admin clicked "Approve & Forward to Margin Edge". */
  approvedForMarginEdgeAt?: Date;
  /** Admin user id who approved (audit). */
  approvedForMarginEdgeBy?: string;
  // ── Per-client internal admin approval (clients/{id}.requireInvoiceApproval)
  /**
   * Snapshot of the client's requireInvoiceApproval flag at invoice creation
   * time. We snapshot rather than read live so toggling the client flag
   * mid-cycle doesn't retroactively unblock or block existing invoices.
   */
  adminApprovalRequired?: boolean;
  /** When an admin clicked "Approve & notify client" on this invoice. */
  adminApprovedAt?: Date;
  /** Admin user id who approved + sent to the client. */
  adminApprovedBy?: string;
  totalAmount: number;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  discountAmount: number;
  lineItems: LineItem[];
  dueDate: Date;
  paidAt?: Date;
  stripePaymentLink?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  // ── Stripe enrichment (populated by webhook + confirm-payment fallback). ──
  // The webhook on checkout.session.completed / payment_intent.succeeded
  // expands the PaymentIntent's latest_charge to fill these in, so admins
  // and clients can audit payments without opening the Stripe Dashboard.
  /** Charge id on the latest successful charge for this invoice. */
  stripeChargeId?: string;
  /** Stripe BalanceTransaction id (for finance reconciliation). */
  stripeBalanceTransactionId?: string;
  /** Stripe-hosted receipt URL (renders for the customer). */
  stripeReceiptUrl?: string;
  /** Hosted Stripe Invoice page URL (one-off invoice flow). */
  stripeHostedInvoiceUrl?: string;
  /** Stripe-generated PDF URL (one-off invoice flow). */
  stripeInvoicePdf?: string;
  /** Stripe Invoice id when the payment came through the hosted-invoice flow. */
  stripeInvoiceId?: string;
  /** Subscription id when this invoice was generated by a recurring plan. */
  stripeSubscriptionId?: string;
  /** Amount Stripe captured, in dollars (verify against totalAmount). */
  stripeAmountReceived?: number;
  /** Captured currency, uppercase ISO-4217 (e.g. 'USD'). */
  stripeCurrency?: string;
  /** Customer email Stripe associated with the payment. */
  stripeCustomerEmail?: string;
  /** Card brand from the charge (e.g. 'visa', 'mastercard'). */
  stripeCardBrand?: string;
  /** Last 4 digits from the charge. */
  stripeCardLast4?: string;
  /** Set when the post-payment Stripe API enrichment failed; helps support. */
  stripeEnrichmentError?: string;
  // ── Margin Edge auto-forward (per-company gated by
  // companies/{id}.marginEdgeEnabled). Populated by the
  // /api/email/send-invoice route after the customer email succeeds.
  /** When the invoice was forwarded to Margin Edge. Idempotency key. */
  marginEdgeSentAt?: Date;
  /** Provider message id for the Margin Edge send. */
  marginEdgeMessageId?: string;
  /** Margin Edge inbox the invoice was forwarded to (for audit). */
  marginEdgeSentTo?: string;
  /** Set when the Margin Edge send failed; cleared on next success. */
  marginEdgeError?: string;
  pdfUrl?: string;
  notes: string;
  terms: string;
  createdBy: string;
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  /** How this invoice was created (e.g. admin_portal, from_quote, upload, recurring) */
  creationSource?: 'admin_portal' | 'from_quote' | 'upload' | 'scheduled' | 'recurring';
  // Auto-charge fields
  autoChargeAttempted?: boolean;
  autoChargeStatus?: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  autoChargeError?: string;
  // ── Invoice Approval (72h window) — populated when client's company has
  // invoiceApprovalRequired=true. The clock starts at createdAt; auto-finalize
  // cron looks for clientApprovalStatus='pending' && now > approvalDeadlineAt.
  // ────────────────────────────────────────────────────────────────────────
  /** Whether this invoice is gated by the 72h client-approval workflow. */
  approvalRequired?: boolean;
  /** Snapshot of the company's permission at creation time, for audit. */
  approvalRequiredCompanyId?: string;
  /** UTC timestamp = createdAt + 72h. */
  approvalDeadlineAt?: Date;
  /** Workflow state. Distinct from `status` so admin can see both. */
  clientApprovalStatus?: 'pending' | 'approved' | 'disputed' | 'auto_finalized';
  approvedAt?: Date;
  disputedAt?: Date;
  disputeReason?: string;
  /** Set when auto-finalize cron transitions a pending invoice past deadline. */
  finalizedAt?: Date;
  /** Idempotency guard — set after the final invoice email is sent (manual approve, auto-finalize). */
  invoiceEmailSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Vendor Payment Types
export type VendorPaymentStatus = 'created' | 'paid';

export interface VendorPaymentAdjustment {
  id: string;
  type: 'increase' | 'decrease';
  amount: number;
  reason: string;
  createdAt: Date | any;
  createdBy: { uid: string; email?: string; name?: string; role: 'admin' };
}

export interface VendorPayment {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  subcontractorId: string;
  subcontractorName: string;
  status: VendorPaymentStatus;
  currency: string; // e.g. "USD"
  baseAmount: number;
  adjustments: VendorPaymentAdjustment[];
  adjustmentTotal: number;
  finalAmount: number;
  internalNotes?: string;
  sourceQuoteId?: string | null;
  createdAt: Date | any;
  createdBy: { uid: string; email?: string; name?: string };
  updatedAt: Date | any;
  updatedBy?: { uid: string; email?: string; name?: string };
}

// (ScheduledInvoice has moved further down — kept near RecurringWorkOrder
// because they share lib/recurrence.ts scheduling math.)

// Chat Types
export interface Chat {
  id: string;
  participants: string[];
  participantDetails: ParticipantDetail[];
  lastMessage: string;
  lastMessageTimestamp: Date;
  lastMessageSenderId: string;
  unreadCount: Record<string, number>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantDetail {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  receiverId: string;
  receiverName: string;
  content: string;
  attachments: string[];
  seen: boolean;
  seenAt?: Date;
  createdAt: Date;
}

// Recurring Work Order Types
export interface RecurringWorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  locationId: string;
  locationName?: string;
  locationAddress?: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  estimateBudget?: number;
  status: 'active' | 'paused' | 'cancelled';
  recurrencePattern: RecurrencePattern;
  /** Display label from FREQUENCY LABEL / Recurrence Pattern: DAILY, SEMIANNUALLY, QUARTERLY, MONTHLY, BI-MONTHLY, BI-WEEKLY */
  recurrencePatternLabel?: 'DAILY' | 'SEMIANNUALLY' | 'QUARTERLY' | 'MONTHLY' | 'BI-MONTHLY' | 'BI-WEEKLY';
  invoiceSchedule: InvoiceSchedule;
  nextExecution: Date;
  lastExecution?: Date;
  lastServiced?: Date; // New field from CSV LAST SERVICED
  nextServiceDates?: Date[]; // Array of up to 5 dates from NEXT SERVICE NEEDED BY
  notes?: string; // From NOTES column
  subcontractorId?: string; // Pre-selected subcontractor from import
  subcontractorName?: string; // Name of pre-selected subcontractor
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  /** Display name of creator (admin or "Import (CSV)") */
  createdByName?: string;
  /** How this recurring work order was created */
  creationSource?: 'admin_portal_ui' | 'csv_import';
  /** Same shape as work orders for Timeline card */
  systemInformation?: WorkOrderSystemInformation;
  timeline?: WorkOrderTimelineEvent[];
}

export interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly';
  interval: number; // Every X months or weeks
  dayOfMonth?: number; // 1-31 for monthly
  daysOfMonth?: number[]; // Array of days (1-31) for BI-MONTHLY (every 2 months) and specific day selection
  daysOfWeek?: number[]; // 0=Sun…6=Sat, used for DAILY pattern
  startDate?: Date; // Starting date for DAILY patterns
  endDate?: Date; // Optional end date for the recurrence
  maxOccurrences?: number; // Optional maximum number of occurrences
  scheduling?: string; // From SCHEDULING column (e.g., "MONDAYS (10AM-5PM)")
}

export interface InvoiceSchedule {
  type: 'monthly' | 'bi-monthly' | 'quarterly' | 'semiannually';
  interval: number;
  dayOfMonth?: number;
  time: string; // Time of day to send invoice
  timezone: string;
}

export interface RecurringWorkOrderExecution {
  id: string;
  recurringWorkOrderId: string;
  workOrderId?: string; // Reference to created work order
  executionNumber: number;
  scheduledDate: Date;
  executedDate?: Date;
  status: 'pending' | 'executed' | 'failed' | 'skipped';
  workOrderPdfUrl?: string;
  invoicePdfUrl?: string;
  stripePaymentLink?: string;
  emailSent: boolean;
  emailSentAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Scheduled Invoice — recurring billing schedule. Mirrors the
 * RecurringWorkOrder shape so the same `lib/recurrence.ts` math works
 * for both. The cron route (/api/scheduled-invoices/cron) creates
 * concrete Invoice docs + Stripe payment links from these on each
 * matching iteration date.
 */
export interface ScheduledInvoice {
  id: string;
  /** Stable display id, e.g. "SI-A1B2C3D4". */
  scheduledInvoiceNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  /** Optional location for invoices tied to a recurring service. */
  locationId?: string;
  locationName?: string;
  locationAddress?: string;
  title: string;
  description?: string;
  notes?: string;
  terms?: string;
  /** Sum of lineItems[].amount; persisted so list views don't have to recompute. */
  totalAmount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  status: 'active' | 'paused' | 'cancelled';
  recurrencePattern: RecurrencePattern;
  recurrencePatternLabel?: 'DAILY' | 'WEEKLY' | 'BI-WEEKLY' | 'MONTHLY' | 'BI-MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY';
  /** Next iteration the cron will fire (computed via lib/recurrence). */
  nextExecution: Date;
  lastExecution?: Date;
  /** Optional auto-charge — when true the cron tries the client's saved PM after creating the invoice. */
  autoCharge?: boolean;
  /** Optional admin override pinning a specific saved PM. Falls back to client default. */
  autoChargePaymentMethodId?: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  createdByName?: string;
  creationSource?: 'admin_portal_ui' | 'csv_import';
  systemInformation?: WorkOrderSystemInformation;
  timeline?: WorkOrderTimelineEvent[];
}

export interface ScheduledInvoiceExecution {
  id: string;
  scheduledInvoiceId: string;
  /** Reference to the invoice this run created. */
  invoiceId?: string;
  invoiceNumber?: string;
  executionNumber: number;
  scheduledDate: Date;
  executedDate?: Date;
  status: 'pending' | 'executed' | 'failed' | 'skipped';
  totalAmount?: number;
  stripePaymentLink?: string;
  emailSent: boolean;
  emailSentAt?: Date;
  failureReason?: string;
  /** Outcome of the auto-charge attempt (if autoCharge was set on the parent). */
  autoChargeAttempted?: boolean;
  autoChargeStatus?: 'succeeded' | 'failed' | 'requires_action' | 'pending';
  autoChargeError?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Payment Log — single row capturing one payment-relevant Stripe event
 * OR one server-initiated payment action (auto-charge, hosted-link
 * finalize, manual mark-as-paid). Lives in the `paymentLogs` collection
 * and is the authoritative audit trail the admin Payment Logs page
 * reads. Built so an operator can answer:
 *   • What happened? (status, type, amount, payment method)
 *   • Which Firestore record(s) got updated as a result?
 *   • If it failed, why and what to do next?
 *   • What was Stripe's full payload at the time?
 */
export interface PaymentLog {
  id: string;

  // ── Stripe-side identity ───────────────────────────────────────
  /** evt_... — present when the row was written from a webhook. Null
   *  for server-initiated actions (those rows are written before the
   *  webhook arrives; the webhook will dedupe by stripeObjectId). */
  stripeEventId?: string;
  /** pi_..., ch_..., in_..., seti_..., cs_..., re_..., dp_... */
  stripeObjectId: string;
  stripeObjectType:
    | 'payment_intent'
    | 'charge'
    | 'invoice'
    | 'setup_intent'
    | 'checkout_session'
    | 'subscription'
    | 'refund'
    | 'dispute';

  status:
    | 'succeeded'
    | 'failed'
    | 'requires_action'
    | 'processing'
    | 'canceled'
    | 'refunded'
    | 'disputed'
    | 'pending';

  // ── Money ──────────────────────────────────────────────────────
  /** Dollars (display-friendly). Always derived from amountCents. */
  amount?: number;
  /** Cents (Stripe canonical). */
  amountCents?: number;
  currency?: string;
  /** Stripe fee in cents (from balance txn). */
  feeAmount?: number;
  /** amount - fee, in cents. */
  netAmount?: number;
  balanceTransactionId?: string;

  // ── Payment method ─────────────────────────────────────────────
  paymentMethodId?: string;
  paymentMethodType?: 'card' | 'us_bank_account' | 'link' | 'cashapp' | 'other';
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  cardCountry?: string;
  cardFunding?: 'credit' | 'debit' | 'prepaid' | 'unknown';
  bankName?: string;
  bankLast4?: string;
  bankAccountType?: string;

  // ── Customer ───────────────────────────────────────────────────
  stripeCustomerId?: string;
  customerEmail?: string;
  customerName?: string;

  // ── Output artifacts ───────────────────────────────────────────
  receiptUrl?: string;
  hostedInvoiceUrl?: string;
  invoicePdfUrl?: string;
  chargeId?: string;

  // ── Risk (cards only) ──────────────────────────────────────────
  riskScore?: number;
  riskLevel?: 'normal' | 'elevated' | 'highest';
  outcomeType?: string; // 'authorized' | 'manual_review' | 'issuer_declined' | etc.
  outcomeReason?: string;
  outcomeNetwork?: string;

  // ── Failure-specific ───────────────────────────────────────────
  /** Stripe machine-readable code (e.g. 'card_declined'). */
  failureCode?: string;
  /** More-specific decline code from the issuer (e.g. 'insufficient_funds'). */
  declineCode?: string;
  /** Human message Stripe sends (often safe to show to admins). */
  failureMessage?: string;
  /** Our categorisation derived from declineCode + failureCode. */
  declineCategory?:
    | 'insufficient_funds'
    | 'authentication_required'
    | 'fraudulent'
    | 'lost_or_stolen'
    | 'expired_card'
    | 'incorrect_data'
    | 'card_velocity'
    | 'currency_unsupported'
    | 'processing_error'
    | 'generic_decline'
    | 'bank_declined'
    | 'unknown';
  /** Plain-English candidates for what went wrong. */
  possibleCauses?: string[];
  /** Concrete next-step suggestions for the admin. */
  nextSteps?: string[];

  // ── Linkage to Firestore records ───────────────────────────────
  linkedInvoiceId?: string;
  linkedInvoiceNumber?: string;
  linkedClientId?: string;
  linkedClientName?: string;
  linkedScheduledInvoiceId?: string;
  linkedRecurringWorkOrderId?: string;
  linkedSubcontractorId?: string;

  // ── Audit / provenance ────────────────────────────────────────
  /** Where this row came from. */
  source:
    | 'webhook'
    | 'auto_charge_route'
    | 'hosted_link_finalize'
    | 'manual_admin'
    | 'backfill';
  /** Friendly label of the originating webhook event ('charge.failed'). */
  rawEventType?: string;
  /** uid of the admin who triggered a manual action (when source != webhook). */
  triggeredByUid?: string;
  triggeredByName?: string;

  /** Append-only record-mutation log: every Firestore doc this event
   *  caused us to update. Lets the admin trace the cascade — e.g.
   *  invoice.paid → invoices/X status:'sent'→'paid' + workOrders/Y
   *  status:'pending_invoice'→'completed'. */
  recordMutations?: PaymentLogMutation[];

  /** Full Stripe object JSON, for forensics. Trimmed when over ~50KB
   *  to avoid Firestore's 1MB doc limit. */
  rawPayload?: any;

  // ── Timestamps ─────────────────────────────────────────────────
  /** Stripe's `created` (unix seconds × 1000). */
  stripeCreatedAt?: any;
  createdAt: any;
}

export interface PaymentLogMutation {
  collection: string;
  docId: string;
  field?: string;
  from?: string;
  to?: string;
  at: any;
  /** One-line human description for the admin UI. */
  summary: string;
}

// Support Tickets
export type SupportTicketCategory =
  | 'billing'
  | 'technical'
  | 'work-order'
  | 'account'
  | 'general'
  | 'bug-report'
  | 'feature-request';

export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SupportTicketStatus =
  | 'open'
  | 'in-progress'
  | 'waiting-on-client'
  | 'waiting-on-admin'
  | 'resolved'
  | 'closed';

export type SupportTicketType = 'question' | 'problem' | 'task' | 'incident';

export interface SupportTicketTimelineEvent {
  id: string;
  timestamp: Date | any;
  type:
    | 'created'
    | 'status-changed'
    | 'priority-changed'
    | 'assigned'
    | 'comment-added'
    | 'attachment-added'
    | 'resolved'
    | 'closed'
    | 'reopened';
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor';
  details: string;
  metadata?: Record<string, any>;
}

export interface SupportTicketAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: Date | any;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  type: SupportTicketType;
  submittedBy: string;
  submittedByName: string;
  submittedByEmail: string;
  submittedByRole: 'admin' | 'client' | 'subcontractor';
  clientId?: string;
  clientName?: string;
  subcontractorId?: string;
  subcontractorName?: string;
  relatedWorkOrderId?: string;
  relatedWorkOrderNumber?: string;
  relatedInvoiceId?: string;
  relatedInvoiceNumber?: string;
  relatedQuoteId?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedAt?: Date | any;
  dueDate?: Date | any;
  resolvedAt?: Date | any;
  closedAt?: Date | any;
  firstResponseAt?: Date | any;
  attachments: SupportTicketAttachment[];
  tags: string[];
  commentCount: number;
  lastActivityAt: Date | any;
  internalNotes?: string;
  timeline: SupportTicketTimelineEvent[];
  createdAt: Date | any;
  updatedAt: Date | any;
}

export interface TicketCommentAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  body: string;
  isInternal: boolean;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorRole: 'admin' | 'client' | 'subcontractor';
  authorAvatarInitials: string;
  attachments: TicketCommentAttachment[];
  editedAt?: Date | any;
  createdAt: Date | any;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  userRole: 'admin' | 'client' | 'subcontractor';
  type:
    | 'work_order'
    | 'quote'
    | 'invoice'
    | 'assignment'
    | 'completion'
    | 'schedule'
    | 'general'
    | 'support_ticket';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  referenceId?: string;
  referenceType?: 'workOrder' | 'quote' | 'invoice' | 'location' | 'supportTicket';
  createdAt: Date;
}