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
        'invoice_sent' | 'payment_received';
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
  taxRate: number;
  taxAmount: number;
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
  status: 'pending' | 'accepted' | 'rejected' | 'sent_to_client';
  isBiddingWorkOrder: boolean;
  acceptedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Invoice Types
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
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  lineItems: LineItem[];
  dueDate: Date;
  paidAt?: Date;
  stripePaymentLink?: string;
  stripeSessionId?: string;
  pdfUrl?: string;
  notes: string;
  terms: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
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
  invoiceSchedule: InvoiceSchedule;
  nextExecution: Date;
  lastExecution?: Date;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface RecurrencePattern {
  type: 'monthly';
  interval: number; // Every X months
  dayOfMonth?: number; // 1-31 for monthly
  endDate?: Date; // Optional end date for the recurrence
  maxOccurrences?: number; // Optional maximum number of occurrences
}

export interface InvoiceSchedule {
  type: 'monthly';
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

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  userRole: 'admin' | 'client' | 'subcontractor';
  type: 'work_order' | 'quote' | 'invoice' | 'assignment' | 'completion' | 'schedule' | 'general';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  referenceId?: string;
  referenceType?: 'workOrder' | 'quote' | 'invoice' | 'location';
  createdAt: Date;
}