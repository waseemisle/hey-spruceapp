'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { WorkOrder, Location } from '@/lib/types'
import WorkOrderForm from '@/components/workorder/WorkOrderForm'
import { 
  Plus, 
  Search, 
  Clock,
  DollarSign,
  MapPin,
  Calendar,
  User,
  AlertCircle
} from 'lucide-react'

export default function ClientWorkOrdersPage() {
  const { user } = useAuth()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  useEffect(() => {
    if (!user?.uid) return

    // Fetch client's work orders
    const workOrdersQuery = query(
      collection(db, 'workorders'),
      where('clientId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    
    const unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkOrder[]
      setWorkOrders(workOrdersData)
      setIsLoading(false)
    })

    // Fetch client's approved locations only
    const locationsQuery = query(
      collection(db, 'locations'),
      where('clientId', '==', user.uid),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    )
    
    const unsubscribeLocations = onSnapshot(locationsQuery, (snapshot) => {
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Location[]
      setLocations(locationsData)
    })

    return () => {
      unsubscribeWorkOrders()
      unsubscribeLocations()
    }
  }, [user?.uid])

  const handleCreateWorkOrder = async (formData: any) => {
    try {
      const selectedLocation = locations.find(l => l.id === formData.locationId)
      
      const response = await fetch('/api/workorders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          location: selectedLocation,
          clientId: user?.uid,
          clientName: user?.fullName,
          clientEmail: user?.email,
          createdBy: user?.uid
        })
      })

      if (response.ok) {
        setShowCreateForm(false)
        alert('Work order submitted for approval!')
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error creating work order:', error)
      alert('Failed to create work order')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      'in-progress': 'bg-blue-100 text-blue-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-gray-100 text-gray-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityBadge = (priority: string) => {
    const variants = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    }
    return variants[priority as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const filteredWorkOrders = workOrders.filter(workOrder => {
    const matchesSearch = workOrder.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || workOrder.status === filterStatus
    const matchesCategory = filterCategory === 'all' || workOrder.category === filterCategory
    
    return matchesSearch && matchesStatus && matchesCategory
  })

  const stats = {
    total: workOrders.length,
    pending: workOrders.filter(w => w.status === 'pending').length,
    approved: workOrders.filter(w => w.status === 'approved').length,
    inProgress: workOrders.filter(w => w.status === 'in-progress').length,
    completed: workOrders.filter(w => w.status === 'completed').length
  }

  const testFetchWorkOrders = async () => {
    try {
      const response = await fetch(`/api/workorders?userId=${user?.uid}&role=client`)
      const data = await response.json()
      console.log('API Response:', data)
      console.log('Current workOrders state:', workOrders)
      console.log('User ID:', user?.uid)
    } catch (error) {
      console.error('Error fetching work orders:', error)
    }
  }

  if (isLoading) {
    return <div className="p-6">Loading work orders...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">My Work Orders</h1>
        <Button 
          onClick={() => setShowCreateForm(true)}
          disabled={locations.length === 0}
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Work Order
        </Button>
      </div>

      {locations.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertCircle className="w-5 h-5" />
              <p>You need at least one approved location to create work orders. Please create and get approval for a location first.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle>
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
            <CardTitle className="text-sm font-medium text-blue-600">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search work orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Debug Button */}
      <Button onClick={testFetchWorkOrders} variant="outline">
        Test Fetch Work Orders
      </Button>

      {/* Work Orders List */}
      <div className="space-y-4">
        {filteredWorkOrders.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <p>No work orders found.</p>
                {locations.length > 0 && (
                  <Button 
                    onClick={() => setShowCreateForm(true)} 
                    className="mt-2"
                  >
                    Create your first work order
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredWorkOrders.map((workOrder) => (
            <Card key={workOrder.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {workOrder.title}
                      <Badge className={getStatusBadge(workOrder.status)}>
                        {workOrder.status}
                      </Badge>
                      <Badge className={getPriorityBadge(workOrder.priority)}>
                        {workOrder.priority}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{workOrder.description}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span>{workOrder.location.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <span>${workOrder.estimatedCost || 0}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>{workOrder.estimatedDuration || 0}h</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <p><strong>Category:</strong> {workOrder.category}</p>
                    <p><strong>Created:</strong> {new Date(workOrder.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    {workOrder.assignedToName && (
                      <p><strong>Assigned to:</strong> {workOrder.assignedToName}</p>
                    )}
                    {workOrder.scheduledDate && (
                      <p><strong>Scheduled:</strong> {new Date(workOrder.scheduledDate).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
                
                {workOrder.status === 'rejected' && workOrder.rejectionReason && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                    <p className="text-red-800"><strong>Rejection Reason:</strong> {workOrder.rejectionReason}</p>
                  </div>
                )}

                {workOrder.notes && (
                  <div className="mt-4 p-3 bg-gray-50 rounded">
                    <p className="text-gray-700"><strong>Notes:</strong> {workOrder.notes}</p>
                  </div>
                )}

              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <WorkOrderForm
          onSubmit={handleCreateWorkOrder}
          onCancel={() => setShowCreateForm(false)}
          locations={locations}
          isAdmin={false}
        />
      )}
    </div>
  )
}
