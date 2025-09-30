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
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { Location } from '@/lib/types'
import CreateLocationModal from '@/components/modals/CreateLocationModal'
import { 
  Plus, 
  Search, 
  MapPin, 
  Building2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Edit,
  Eye
} from 'lucide-react'

export default function AdminLocationsPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [locations, setLocations] = useState<Location[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
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
      const q = query(
        collection(db, 'locations'),
        orderBy('createdAt', 'desc')
      )
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const locationsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Location[]
        
        console.log('Fetched locations:', locationsData)
        setLocations(locationsData)
      }, (error) => {
        console.error('Error fetching locations:', error)
      })

      return () => unsubscribe()
    }
  }, [profile])

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

      alert('Location created successfully!')
      setShowCreateForm(false)
    } catch (error) {
      console.error('Error creating location:', error)
      alert(`Failed to create location: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      alert('Location approved successfully!')
    } catch (error) {
      console.error('Error approving location:', error)
      alert(`Failed to approve location: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      alert('Location rejected successfully!')
    } catch (error) {
      console.error('Error rejecting location:', error)
      alert(`Failed to reject location: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Filter locations based on search and status
  const filteredLocations = locations.filter(location => {
    const matchesSearch = location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         location.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         location.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         location.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || location.status === statusFilter
    
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
                          <h3 className="text-lg font-semibold">{location.name}</h3>
                          <Badge className={getStatusColor(location.status)}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(location.status)}
                              {location.status}
                            </span>
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                          <div>
                            <p><strong>Address:</strong> {location.address}</p>
                            <p><strong>City:</strong> {location.city}, {location.state} {location.zipCode}</p>
                            <p><strong>Type:</strong> {location.type}</p>
                          </div>
                          <div>
                            <p><strong>Client:</strong> {location.clientName}</p>
                            <p><strong>Email:</strong> {location.clientEmail}</p>
                            <p><strong>Created:</strong> {new Date(location.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>

                        {location.description && (
                          <p className="text-sm text-gray-600 mt-2">
                            <strong>Description:</strong> {location.description}
                          </p>
                        )}

                        {location.rejectionReason && (
                          <p className="text-sm text-red-600 mt-2">
                            <strong>Rejection Reason:</strong> {location.rejectionReason}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        {location.status === 'pending' && (
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
                          onClick={() => setSelectedLocation(location)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
