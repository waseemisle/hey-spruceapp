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
