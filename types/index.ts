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
        'invoice_sent' | 'invoice_paid' | 'payment_received';
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
  status: 'pending' | 'approved' | 'rejected' | 'quote_received' | 'quotes_received' | 'assigned' | 'in-progress' | 'completed';
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
  creationSource?: 'subcontractor_bidding' | 'admin_portal';
  createdAt: Date;
  updatedAt: Date;
}

// Invoice Types
export type InvoiceTimelineEventType = 'created' | 'sent' | 'paid';

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
  status: 'draft' | 'sent' | 'paid' | 'overdue';
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
  pdfUrl?: string;
  notes: string;
  terms: string;
  createdBy: string;
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  /** How this invoice was created (e.g. admin_portal, from_quote, upload) */
  creationSource?: 'admin_portal' | 'from_quote' | 'upload' | 'scheduled';
  // Auto-charge fields
  autoChargeAttempted?: boolean;
  autoChargeStatus?: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  autoChargeError?: string;
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

export interface ScheduledInvoice {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  title: string;
  description: string;
  subcontractorAmount: number;
  spruceAmount: number;
  amount: number;
  categoryId: string;
  categoryName: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  timezone: string;
  isActive: boolean;
  nextExecution: Date;
  lastExecution?: Date;
  notes: string;
  invoiceNumber: string;
  invoiceStatus: 'open' | 'paid';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

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
  type: 'monthly' | 'weekly'; // Added 'weekly' for BI-WEEKLY
  interval: number; // Every X months or weeks
  dayOfMonth?: number; // 1-31 for monthly
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