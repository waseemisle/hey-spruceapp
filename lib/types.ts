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
  status: 'pending' | 'approved' | 'rejected' | 'in-progress' | 'completed' | 'cancelled'
  category: 'maintenance' | 'repair' | 'installation' | 'inspection' | 'cleaning' | 'other'
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
  estimatedCost?: number
  actualCost?: number
  estimatedDuration?: number // in hours
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
  quoteStatus?: 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired'
  quoteId?: string
  quoteApprovedAt?: string
  quoteApprovedBy?: string
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
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  totalAmount: number
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
  createdBy: string // admin ID who created it
  createdAt: string
  updatedAt: string
  sentAt?: string
  acceptedAt?: string
  rejectedAt?: string
  rejectionReason?: string
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
  currentStep: 'quote_created' | 'quote_sent' | 'quote_approved' | 'quote_rejected' | 'work_assigned' | 'work_in_progress' | 'work_completed' | 'invoice_created' | 'invoice_sent' | 'invoice_paid'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  lastUpdated: string
  lastUpdatedBy: string
  notes?: string
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