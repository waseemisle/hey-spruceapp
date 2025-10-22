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
  phone: string;
  address?: Address;
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
  subsidiaryId: string;
  subsidiaryName: string;
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

// Subsidiary Types
export interface Subsidiary {
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

// Category Types
export interface Category {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
}

// Work Order Types
export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
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
  completedAt?: Date;
  completionNotes?: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
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
  status: 'pending' | 'accepted' | 'rejected';
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
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval: number; // Every X days/weeks/months/years
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday) for weekly
  dayOfMonth?: number; // 1-31 for monthly
  monthOfYear?: number; // 1-12 for yearly
  customPattern?: string; // For custom patterns like "Every 2 weeks on Tuesday"
  endDate?: Date; // Optional end date for the recurrence
  maxOccurrences?: number; // Optional maximum number of occurrences
}

export interface InvoiceSchedule {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  monthOfYear?: number;
  customPattern?: string;
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