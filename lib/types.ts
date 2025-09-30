export interface Location {
  id: string
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  description?: string
  type: 'office' | 'warehouse' | 'retail' | 'residential' | 'industrial' | 'other'
  status: 'pending' | 'approved' | 'rejected'
  clientId: string
  clientName: string
  clientEmail: string
  createdBy: string // userId who created it
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectedBy?: string
  rejectionReason?: string
  coordinates?: {
    lat: number
    lng: number
  }
  contactInfo?: {
    phone?: string
    email?: string
    contactPerson?: string
  }
  additionalInfo?: string
}

export interface Category {
  id: string
  name: string
  description?: string
  isActive: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface LocationFormData {
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  description?: string
  type: 'office' | 'warehouse' | 'retail' | 'residential' | 'industrial' | 'other'
  contactInfo?: {
    phone?: string
    email?: string
    contactPerson?: string
  }
  additionalInfo?: string
}

export interface WorkOrder {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'approved' | 'rejected' | 'waiting_for_quote' | 'quote_received' | 'quotes_received' | 'quote_sent_to_client' | 'quote_approved' | 'assigned' | 'in_progress' | 'completed_by_contractor' | 'completed' | 'cancelled'
  workOrderNumber: string
  categoryId: string
  categoryName: string
  location: {
    id: string
    name: string
    address: string
  }
  clientId: string
  clientName: string
  clientEmail: string
  assignedTo?: string // subcontractor ID
  assignedToName?: string // subcontractor name
  estimatedCost: number
  estimatedDateOfService: string
  actualCost?: number
  actualDuration?: number // in hours
  scheduledDate?: string
  completedDate?: string
  createdBy: string // user ID who created it
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectedBy?: string
  rejectionReason?: string
  assignedAt?: string
  assignedBy?: string
  attachments?: string[] // file URLs
  notes?: string
  quotes?: {
    id: string
    subcontractorId: string
    subcontractorName: string
    amount: number
    status: 'pending' | 'shared_with_client' | 'accepted' | 'rejected'
    createdAt: string
  }[]
  selectedSubcontractors?: string[] // IDs of subcontractors selected for bidding
  sharedWithClient?: boolean
  invoiceId?: string
}

export interface WorkOrderFormData {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category: 'maintenance' | 'repair' | 'installation' | 'inspection' | 'cleaning' | 'other'
  locationId: string
  estimatedCost?: string // Changed to string for form input
  estimatedDuration?: string // Changed to string for form input
  scheduledDate?: string
  notes?: string
}

export interface Subcontractor {
  id: string
  userId: string
  fullName: string
  email: string
  phone: string
  title: string
  categoryId: string
  categoryName: string
  skills: string[]
  experience: string
  hourlyRate?: number
  availability: 'available' | 'busy' | 'unavailable'
  status: 'pending' | 'approved' | 'rejected'
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
  businessInfo?: {
    businessName?: string
    licenseNumber?: string
    insuranceInfo?: string
  }
  references?: {
    name: string
    contact: string
    relationship: string
  }[]
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectedBy?: string
  rejectionReason?: string
}

export interface SubcontractorRegistrationData {
  fullName: string
  email: string
  phone: string
  title: string
  categoryId: string
  skills: string[]
  experience: string
  hourlyRate?: string
  password: string
  confirmPassword: string
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
  businessInfo?: {
    businessName?: string
    licenseNumber?: string
    insuranceInfo?: string
  }
  references?: {
    name: string
    contact: string
    relationship: string
  }[]
}

export interface ClientRegistrationData {
  fullName: string
  email: string
  phone: string
  companyName?: string
  businessType?: string
  numberOfProperties?: string
  estimatedMonthlySpend?: string
  preferredServices?: string[]
  password: string
  confirmPassword: string
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
}

export interface Client {
  id: string
  userId: string
  fullName: string
  email: string
  phone: string
  companyName?: string
  businessType?: string
  numberOfProperties?: number
  estimatedMonthlySpend?: number
  preferredServices?: string[]
  status: 'pending' | 'approved' | 'rejected'
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectedBy?: string
  rejectionReason?: string
}

export interface Quote {
  id: string
  workOrderId: string
  workOrderTitle: string
  workOrderDescription: string
  workOrderLocation: {
    id: string
    name: string
    address: string
  }
  clientId: string
  clientName: string
  clientEmail: string
  subcontractorId: string
  subcontractorName: string
  subcontractorEmail: string
  status: 'pending' | 'shared_with_client' | 'accepted' | 'rejected' | 'edited_by_admin'
  originalAmount: number // Amount submitted by subcontractor
  clientAmount: number // Amount shown to client (original + 20%)
  markupPercentage: number // Default 20%
  laborCost: number
  materialCost: number
  additionalCosts: number
  taxRate: number
  taxAmount: number
  discountAmount?: number
  validUntil: string
  lineItems: QuoteLineItem[]
  notes?: string
  terms?: string
  adminNotes?: string // Notes added by admin when editing
  createdBy: string // subcontractor ID who submitted it
  createdAt: string
  updatedAt: string
  sentAt?: string
  acceptedAt?: string
  rejectedAt?: string
  rejectionReason?: string
  editedBy?: string // admin ID who edited it
  editedAt?: string
}

export interface QuoteLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  category: 'labor' | 'material' | 'equipment' | 'other'
}

export interface QuoteFormData {
  workOrderId: string
  laborCost: string
  materialCost: string
  additionalCosts: string
  taxRate: string
  discountAmount?: string
  validUntil: string
  lineItems: Omit<QuoteLineItem, 'id' | 'totalPrice'>[]
  notes?: string
  terms?: string
  sendEmail?: boolean
}

export interface UserProfile {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'client' | 'subcontractor'
  companyName?: string
  phone?: string
  address?: string
  businessType?: string
  numberOfProperties?: number
  estimatedMonthlySpend?: string
  preferredServices?: string[]
  createdAt: string
  updatedAt: string
}

export interface Invoice {
  id: string
  quoteId: string
  workOrderId: string
  workOrderTitle: string
  workOrderDescription: string
  workOrderLocation: {
    id: string
    name: string
    address: string
  }
  clientId: string
  clientName: string
  clientEmail: string
  subcontractorId?: string
  subcontractorName?: string
  subcontractorEmail?: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  totalAmount: number
  laborCost: number
  materialCost: number
  additionalCosts: number
  taxRate: number
  taxAmount: number
  discountAmount?: number
  lineItems: InvoiceLineItem[]
  notes?: string
  terms?: string
  dueDate: string
  invoiceNumber: string
  pdfUrl?: string
  createdBy: string // admin ID who created it
  createdAt: string
  updatedAt: string
  sentAt?: string
  paidAt?: string
  paymentMethod?: string
  paymentReference?: string
}

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  category: 'labor' | 'material' | 'equipment' | 'other'
}

export interface InvoiceFormData {
  quoteId: string
  workOrderId: string
  dueDate: string
  notes?: string
  terms?: string
  paymentTerms?: string
  sendEmail?: boolean
}

export interface WorkflowStatus {
  id: string
  workOrderId: string
  quoteId?: string
  invoiceId?: string
  currentStep: 'workorder_created' | 'waiting_for_quote' | 'quotes_received' | 'quote_sent_to_client' | 'quote_approved' | 'work_assigned' | 'work_in_progress' | 'work_completed' | 'invoice_created' | 'invoice_sent' | 'invoice_paid'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  lastUpdated: string
  lastUpdatedBy: string
  notes?: string
}

export interface AdminUser {
  id: string
  userId: string
  fullName: string
  email: string
  role: 'admin'
  isActive: boolean
  createdBy: string // admin ID who created this admin
  createdAt: string
  updatedAt: string
}

export interface ScheduledInvoice {
  id: string
  clientId: string
  clientName: string
  clientEmail: string
  title: string
  description: string
  amount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  dayOfWeek?: number | null // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number | null // 1-31 for monthly
  time: string // HH:MM format
  timezone: string // e.g., 'America/New_York'
  isActive: boolean
  lastExecuted?: string
  nextExecution?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  notes?: string
}

export interface ScheduledInvoiceFormData {
  clientId: string
  title: string
  description: string
  amount: string
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  dayOfWeek?: string
  dayOfMonth?: string
  time: string
  timezone: string
  notes?: string
}

export interface BiddingWorkOrder {
  id: string
  workOrderId: string
  workOrderNumber: string
  workOrderTitle: string
  workOrderDescription: string
  workOrderLocation: {
    id: string
    name: string
    address: string
  }
  clientId: string
  clientName: string
  categoryId: string
  categoryName: string
  estimatedCost: number
  estimatedDateOfService: string
  status: 'open_for_bidding' | 'quote_submitted' | 'closed'
  createdAt: string
  updatedAt: string
}

export interface AssignedWorkOrder {
  id: string
  workOrderId: string
  workOrderTitle: string
  workOrderDescription: string
  workOrderLocation: {
    id: string
    name: string
    address: string
  }
  clientId: string
  clientName: string
  categoryId: string
  categoryName: string
  estimatedCost: number
  actualCost?: number
  estimatedDateOfService: string
  scheduledDate?: string
  status: 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  assignedAt: string
  createdAt: string
  updatedAt: string
}