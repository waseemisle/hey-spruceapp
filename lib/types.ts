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
