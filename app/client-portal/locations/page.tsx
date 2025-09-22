'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
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
  Eye
} from 'lucide-react'

export default function ClientLocationsPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [locations, setLocations] = useState<Location[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.push('/portal-login')
      return
    }

    if (profile && profile.role !== 'client') {
      router.push('/portal-login')
      return
    }
  }, [user, profile, loading, router])

  // Fetch client's own locations from Firestore
  useEffect(() => {
    if (profile && profile.role === 'client') {
      console.log('Fetching locations for client:', profile.id)
      
      // Try without orderBy first to avoid index issues
      const q = query(
        collection(db, 'locations'),
        where('clientId', '==', profile.id)
      )
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const locationsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Location[]
        
        // Sort manually by createdAt (most recent first)
        locationsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        
        console.log('Fetched client locations:', locationsData)
        console.log('Total locations found:', locationsData.length)
        setLocations(locationsData)
      }, (error) => {
        console.error('Error fetching client locations:', error)
        console.error('Error details:', error.message)
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

      alert('Location submitted successfully! It will be reviewed by admin.')
      setShowCreateForm(false)
    } catch (error) {
      console.error('Error creating location:', error)
      alert(`Failed to create location: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }


  // Filter locations based on search
  const filteredLocations = locations.filter(location => {
    return location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           location.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
           location.city.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Locations</h1>
            <p className="text-gray-600">Manage your locations and track approval status</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Location
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                  <p className="text-sm font-medium text-gray-600">Pending Review</p>
                  <p className="text-2xl font-bold">{locations.filter(l => l.status === 'pending').length}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-2xl font-bold">{locations.filter(l => l.status === 'approved').length}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Rejected</p>
                  <p className="text-2xl font-bold">{locations.filter(l => l.status === 'rejected').length}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Search Locations</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search by name, address, or city..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
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
            <CardTitle>Your Locations ({filteredLocations.length})</CardTitle>
            <CardDescription>Track the status of your location submissions</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredLocations.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No locations found</p>
                <p className="text-gray-400 text-sm mt-1">Create your first location to get started</p>
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
                            <p><strong>Submitted:</strong> {new Date(location.createdAt).toLocaleDateString()}</p>
                            {location.approvedAt && (
                              <p><strong>Approved:</strong> {new Date(location.approvedAt).toLocaleDateString()}</p>
                            )}
                            {location.rejectedAt && (
                              <p><strong>Rejected:</strong> {new Date(location.rejectedAt).toLocaleDateString()}</p>
                            )}
                          </div>
                        </div>

                        {location.description && (
                          <p className="text-sm text-gray-600 mt-2">
                            <strong>Description:</strong> {location.description}
                          </p>
                        )}

                        {location.rejectionReason && (
                          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-800">
                              <strong>Rejection Reason:</strong> {location.rejectionReason}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // You could implement a view details modal here
                            alert(`Location: ${location.name}\nAddress: ${location.address}\nStatus: ${location.status}`)
                          }}
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
