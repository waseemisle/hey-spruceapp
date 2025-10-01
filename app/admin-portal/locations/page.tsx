'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { Location } from '@/lib/types'
import CreateLocationModal from '@/components/modals/CreateLocationModal'
import Modal from '@/components/ui/modal'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Plus, 
  Search, 
  MapPin, 
  Building2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Edit,
  Eye,
  Trash2
} from 'lucide-react'

export default function AdminLocationsPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  const [locations, setLocations] = useState<Location[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.push('/portal-login')
      return
    }

    if (profile && profile.role !== 'admin') {
      router.push('/portal-login')
      return
    }
  }, [user, profile, loading, router])

  // Fetch locations from Firestore
  useEffect(() => {
    if (profile && profile.role === 'admin') {
      const q = db.collection('locations').orderBy('createdAt', 'desc')
      
      const unsubscribe = q.onSnapshot((snapshot) => {
        const locationsData = snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            ...data,
            // Ensure all fields are strings
            name: String(data.name || ''),
            address: String(data.address || ''),
            city: String(data.city || ''),
            state: String(data.state || ''),
            zipCode: String(data.zipCode || ''),
            country: String(data.country || ''),
            description: String(data.description || ''),
            type: String(data.type || ''),
            status: String(data.status || ''),
            clientName: String(data.clientName || ''),
            clientEmail: String(data.clientEmail || ''),
            createdAt: String(data.createdAt || ''),
            updatedAt: String(data.updatedAt || ''),
            rejectionReason: String(data.rejectionReason || '')
          }
        }) as Location[]
        
        console.log('Fetched locations:', locationsData)
        setLocations(locationsData)
      }, (error) => {
        console.error('Error fetching locations:', error)
      })

      return () => unsubscribe()
    }
  }, [profile])

  const openViewModal = (location: Location) => {
    setSelectedLocation(location)
    setShowViewModal(true)
  }

  const handleCreateLocation = async (locationData: any) => {
    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...locationData,
          clientId: profile?.id,
          clientName: profile?.fullName,
          clientEmail: profile?.email,
          createdBy: profile?.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create location')
      }

      success('Location created successfully!')
      setShowCreateForm(false)
    } catch (err) {
      console.error('Error creating location:', err)
      error(`Failed to create location: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleApproveLocation = async (locationId: string) => {
    try {
      const response = await fetch('/api/admin/locations/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          locationId,
          approvedBy: profile?.email 
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve location')
      }

      success('Location approved successfully!')
    } catch (err) {
      console.error('Error approving location:', err)
      error(`Failed to approve location: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleRejectLocation = async (locationId: string) => {
    const reason = prompt('Please provide a reason for rejection:')
    if (!reason) return

    try {
      const response = await fetch('/api/admin/locations/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          locationId,
          reason,
          rejectedBy: profile?.email 
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject location')
      }

      success('Location rejected successfully!')
    } catch (err) {
      console.error('Error rejecting location:', err)
      error(`Failed to reject location: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const openDeleteModal = (location: Location) => {
    setSelectedLocation(location)
    setShowDeleteModal(true)
  }

  const handleDeleteLocation = async () => {
    if (!selectedLocation) return

    try {
      const response = await fetch(`/api/admin/locations/delete?locationId=${selectedLocation.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete location')
      }

      success('Location deleted successfully!')
      setShowDeleteModal(false)
      setSelectedLocation(null)
    } catch (err) {
      console.error('Error deleting location:', err)
      error(`Failed to delete location: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Filter locations based on search and status
  const filteredLocations = locations.filter(location => {
    const name = String(location.name || '').toLowerCase()
    const address = String(location.address || '').toLowerCase()
    const city = String(location.city || '').toLowerCase()
    const clientName = String(location.clientName || '').toLowerCase()
    const status = String(location.status || '')
    
    const matchesSearch = name.includes(searchTerm.toLowerCase()) ||
                         address.includes(searchTerm.toLowerCase()) ||
                         city.includes(searchTerm.toLowerCase()) ||
                         clientName.includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4" />
      case 'rejected': return <XCircle className="h-4 w-4" />
      case 'pending': return <Clock className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user || !profile) {
    return null
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Locations Management</h1>
            <p className="text-gray-600">Manage all locations across the platform</p>
          </div>
          <Button
            onClick={() => setShowCreateForm(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Location
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Locations</p>
                  <p className="text-2xl font-bold">{locations.length}</p>
                </div>
                <MapPin className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Locations for Review</p>
                  <p className="text-2xl font-bold">{locations.filter(l => l.status === 'pending').length}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Search Locations</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search by name, address, city, or client..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <Label htmlFor="status">Status Filter</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create Location Modal */}
        <CreateLocationModal
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          onSubmit={handleCreateLocation}
          isSubmitting={false}
        />

        {/* Locations List */}
        <Card>
          <CardHeader>
            <CardTitle>All Locations ({filteredLocations.length})</CardTitle>
            <CardDescription>Manage and approve client locations</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredLocations.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No locations found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLocations.map((location) => (
                  <div key={location.id} className="border rounded-lg p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Building2 className="h-5 w-5 text-gray-600" />
                          <h3 className="text-lg font-semibold">{String(location.name || '')}</h3>
                          <Badge className={getStatusColor(String(location.status || ''))}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(String(location.status || ''))}
                              {String(location.status || '')}
                            </span>
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                          <div>
                            <p><strong>Address:</strong> {String(location.address || '')}</p>
                            <p><strong>City:</strong> {String(location.city || '')}, {String(location.state || '')} {String(location.zipCode || '')}</p>
                            <p><strong>Type:</strong> {String(location.type || '')}</p>
                          </div>
                          <div>
                            <p><strong>Client:</strong> {String(location.clientName || '')}</p>
                            <p><strong>Email:</strong> {String(location.clientEmail || '')}</p>
                            <p><strong>Created:</strong> {location.createdAt ? new Date(String(location.createdAt)).toLocaleDateString() : 'N/A'}</p>
                          </div>
                        </div>

                        {location.description && (
                          <p className="text-sm text-gray-600 mt-2">
                            <strong>Description:</strong> {String(location.description)}
                          </p>
                        )}

                        {location.rejectionReason && (
                          <p className="text-sm text-red-600 mt-2">
                            <strong>Rejection Reason:</strong> {String(location.rejectionReason)}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        {String(location.status || '') === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApproveLocation(location.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectLocation(location.id)}
                              className="border-red-300 text-red-600 hover:bg-red-50"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openViewModal(location)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteModal(location)}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Details Modal */}
        <Modal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          title="Location Details"
        >
          {selectedLocation && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Location Name</Label>
                  <div className="text-sm text-gray-900">{String(selectedLocation.name || '')}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(String(selectedLocation.status || ''))}>
                      {String(selectedLocation.status || '')}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Type</Label>
                  <div className="text-sm text-gray-900 capitalize">{String(selectedLocation.type || '')}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Country</Label>
                  <div className="text-sm text-gray-900">{String(selectedLocation.country || '')}</div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Address</Label>
                <div className="text-sm text-gray-900">
                  {String(selectedLocation.address || '')}<br />
                  {String(selectedLocation.city || '')}, {String(selectedLocation.state || '')} {String(selectedLocation.zipCode || '')}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Client Information</Label>
                  <div className="text-sm text-gray-900 space-y-1">
                    <div><strong>Name:</strong> {String(selectedLocation.clientName || '')}</div>
                    <div><strong>Email:</strong> {String(selectedLocation.clientEmail || '')}</div>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Timestamps</Label>
                  <div className="text-sm text-gray-900 space-y-1">
                    <div><strong>Created:</strong> {selectedLocation.createdAt ? new Date(String(selectedLocation.createdAt)).toLocaleDateString() : 'N/A'}</div>
                    <div><strong>Updated:</strong> {selectedLocation.updatedAt ? new Date(String(selectedLocation.updatedAt)).toLocaleDateString() : 'N/A'}</div>
                  </div>
                </div>
              </div>

              {selectedLocation.description && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Description</Label>
                  <div className="text-sm text-gray-900">{String(selectedLocation.description)}</div>
                </div>
              )}

              {selectedLocation.rejectionReason && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Rejection Reason</Label>
                  <div className="text-sm text-red-600">{String(selectedLocation.rejectionReason)}</div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowViewModal(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false)
            setSelectedLocation(null)
          }}
          title="Delete Location"
        >
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Delete Location
              </h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to delete this location? This action cannot be undone.
              </p>
              <p className="text-sm text-amber-600 mt-2">
                <strong>Note:</strong> Locations that are being used in work orders cannot be deleted.
              </p>
              {selectedLocation && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{String(selectedLocation.name || '')}</p>
                  <p className="text-sm text-gray-500">Address: {String(selectedLocation.address || '')}</p>
                  <p className="text-sm text-gray-500">Status: {String(selectedLocation.status || '')}</p>
                  <p className="text-sm text-gray-500">Client: {String(selectedLocation.clientName || '')}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedLocation(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteLocation}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Location
              </Button>
            </div>
          </div>
        </Modal>
        </div>
      </div>
    </>
  )
}
