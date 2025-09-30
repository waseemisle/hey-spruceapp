'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/modal'
import { useAuth } from '@/lib/auth'
import { Location, LocationFormData } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Plus, 
  Search, 
  MapPin, 
  Building2, 
  Edit,
  Eye,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react'

export default function ClientLocationsPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  
  const [formData, setFormData] = useState<LocationFormData>({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA',
    description: '',
    type: 'office',
    contactInfo: {
      phone: '',
      email: '',
      contactPerson: ''
    },
    additionalInfo: ''
  })

  useEffect(() => {
    fetchLocations()
  }, [])

  const fetchLocations = async () => {
    try {
      const response = await fetch('/api/client/locations')
      if (response.ok) {
        const data = await response.json()
        setLocations(data)
      } else {
        error('Fetch Error', 'Failed to load locations')
      }
    } catch (err) {
      error('Fetch Error', 'Error loading locations')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    if (field.startsWith('contactInfo.')) {
      const contactField = field.split('.')[1]
      setFormData(prev => ({
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          [contactField]: value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.address || !formData.city || !formData.state || !formData.zipCode) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          clientId: profile?.id,
          clientName: profile?.fullName,
          clientEmail: profile?.email,
          createdBy: user?.uid
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create location')
      }

      success('Location Created', 'Location created successfully and submitted for admin approval!')
      setShowCreateModal(false)
      resetForm()
      fetchLocations()
    } catch (err: any) {
      error('Creation Failed', err.message)
    }
  }

  const handleEditLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedLocation || !formData.name || !formData.address || !formData.city || !formData.state || !formData.zipCode) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    try {
      const response = await fetch(`/api/locations/${selectedLocation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update location')
      }

      success('Location Updated', 'Location updated successfully!')
      setShowEditModal(false)
      setSelectedLocation(null)
      resetForm()
      fetchLocations()
    } catch (err: any) {
      error('Update Failed', err.message)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA',
      description: '',
      type: 'office',
      contactInfo: {
        phone: '',
        email: '',
        contactPerson: ''
      },
      additionalInfo: ''
    })
  }

  const openEditModal = (location: Location) => {
    setSelectedLocation(location)
    setFormData({
      name: location.name,
      address: location.address,
      city: location.city,
      state: location.state,
      zipCode: location.zipCode,
      country: location.country,
      description: location.description || '',
      type: location.type,
      contactInfo: location.contactInfo || {
        phone: '',
        email: '',
        contactPerson: ''
      },
      additionalInfo: location.additionalInfo || ''
    })
    setShowEditModal(true)
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4" />
      case 'rejected': return <XCircle className="h-4 w-4" />
      case 'pending': return <Clock className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const filteredLocations = locations.filter(location => {
    const matchesSearch = location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         location.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         location.city.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || location.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: locations.length,
    pending: locations.filter(l => l.status === 'pending').length,
    approved: locations.filter(l => l.status === 'approved').length,
    rejected: locations.filter(l => l.status === 'rejected').length
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading locations...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Locations Management</h1>
          <p className="text-gray-600">Manage your property locations</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Locations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rejected}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Create Location
          </Button>
        </div>

        {/* Locations List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLocations.map((location) => (
            <Card key={location.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{location.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className={getStatusBadge(location.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(location.status)}
                          {location.status}
                        </span>
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div className="text-sm text-gray-600">
                      <p>{location.address}</p>
                      <p>{location.city}, {location.state} {location.zipCode}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600 capitalize">{location.type}</span>
                  </div>
                  
                  {location.description && (
                    <p className="text-sm text-gray-600">{location.description}</p>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    Created: {new Date(location.createdAt).toLocaleDateString()}
                  </div>

                  {location.rejectionReason && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>Rejection Reason:</strong> {location.rejectionReason}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(location)}
                    className="flex-1"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedLocation(location)}
                    className="flex-1"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredLocations.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <div className="text-gray-500 mb-4">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No locations found</h3>
                <p className="text-sm">Create your first location to get started</p>
              </div>
              <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Create Location
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create Location Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create New Location"
        >
          <form onSubmit={handleCreateLocation} className="space-y-4">
            <div>
              <Label htmlFor="name">Location Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter location name"
                required
              />
            </div>

            <div>
              <Label htmlFor="address">Street Address *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter street address"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  placeholder="State"
                  required
                />
              </div>
              <div>
                <Label htmlFor="zipCode">ZIP Code *</Label>
                <Input
                  id="zipCode"
                  value={formData.zipCode}
                  onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  placeholder="ZIP"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="type">Property Type *</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Enter location description"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="contactPerson">Contact Person</Label>
              <Input
                id="contactPerson"
                value={formData.contactInfo?.contactPerson || ''}
                onChange={(e) => handleInputChange('contactInfo.contactPerson', e.target.value)}
                placeholder="Contact person name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.contactInfo?.phone || ''}
                  onChange={(e) => handleInputChange('contactInfo.phone', e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.contactInfo?.email || ''}
                  onChange={(e) => handleInputChange('contactInfo.email', e.target.value)}
                  placeholder="Email address"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                Create Location
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Location Modal */}
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit Location"
        >
          <form onSubmit={handleEditLocation} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Location Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter location name"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-address">Street Address *</Label>
              <Input
                id="edit-address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter street address"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="edit-city">City *</Label>
                <Input
                  id="edit-city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-state">State *</Label>
                <Input
                  id="edit-state"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  placeholder="State"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-zipCode">ZIP Code *</Label>
                <Input
                  id="edit-zipCode"
                  value={formData.zipCode}
                  onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  placeholder="ZIP"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-type">Property Type *</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Enter location description"
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                Update Location
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </>
  )
}