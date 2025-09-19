'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { useLoading } from '@/contexts/LoadingContext'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { WorkOrder, Location } from '@/lib/types'
import CreateWorkOrderModal from '@/components/modals/CreateWorkOrderModal'
import EditWorkOrderModal from '@/components/modals/EditWorkOrderModal'
import ViewWorkOrderModal from '@/components/modals/ViewWorkOrderModal'
import CreateQuoteModal from '@/components/modals/CreateQuoteModal'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  UserPlus,
  Clock,
  DollarSign,
  MapPin,
  Eye,
  Calculator
} from 'lucide-react'

export default function AdminWorkOrdersPage() {
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error, info } = useNotifications()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [viewingWorkOrder, setViewingWorkOrder] = useState<WorkOrder | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')

  // Assignment modal state
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null)
  const [selectedSubcontractor, setSelectedSubcontractor] = useState('')
  const [subcontractors, setSubcontractors] = useState<any[]>([])
  const [isAssigning, setIsAssigning] = useState(false)

  // Rejection modal state
  const [showRejectionModal, setShowRejectionModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  // Quote modal state
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [selectedWorkOrderForQuote, setSelectedWorkOrderForQuote] = useState<WorkOrder | null>(null)

  useEffect(() => {
    // Fetch work orders
    const workOrdersQuery = query(collection(db, 'workorders'), orderBy('createdAt', 'desc'))
    const unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkOrder[]
      setWorkOrders(workOrdersData)
    })

    // Fetch locations
    const locationsQuery = query(collection(db, 'locations'), orderBy('createdAt', 'desc'))
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
  }, [])

  const handleCreateWorkOrder = async (formData: any) => {
    try {
      // Check if user data is still loading
      if (!user || !profile) {
        error('Loading', 'User data is still loading. Please wait a moment and try again.')
        return
      }

      const selectedLocation = locations.find(l => l.id === formData.locationId)
      
      if (!selectedLocation) {
        error('Location Required', 'Please select a valid location')
        return
      }

      if (!user.uid || !profile.fullName || !profile.email) {
        error('User Error', 'User information is missing. Please refresh and try again.')
        return
      }

      const requestData = {
        ...formData,
        location: {
          id: selectedLocation.id,
          name: selectedLocation.name,
          address: selectedLocation.address
        },
        clientId: user.uid,
        clientName: profile.fullName,
        clientEmail: profile.email,
        createdBy: user.uid
      }

      console.log('Creating work order with data:', requestData)

      const response = await fetch('/api/workorders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      })

      if (response.ok) {
        setShowCreateForm(false)
        success('Work Order Created', 'Work order created successfully!')
      } else {
        const errorData = await response.json()
        error('Creation Failed', errorData.error || 'Failed to create work order')
      }
    } catch (err) {
      console.error('Error creating work order:', err)
      error('Error', 'Failed to create work order')
    }
  }

  const handleEditWorkOrder = async (formData: any) => {
    if (!editingWorkOrder) return

    try {
      const selectedLocation = locations.find(l => l.id === formData.locationId)
      
      if (!selectedLocation) {
        error('Location Required', 'Please select a valid location')
        return
      }

      const requestData = {
        ...formData,
        location: {
          id: selectedLocation.id,
          name: selectedLocation.name,
          address: selectedLocation.address
        },
        status: formData.status || editingWorkOrder.status
      }

      console.log('Updating work order with data:', requestData)

      const response = await fetch(`/api/workorders/${editingWorkOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      })

      if (response.ok) {
        setShowEditForm(false)
        setEditingWorkOrder(null)
        success('Work Order Updated', 'Work order updated successfully!')
      } else {
        const errorData = await response.json()
        error('Update Failed', errorData.error || 'Failed to update work order')
      }
    } catch (err) {
      console.error('Error updating work order:', err)
      error('Error', 'Failed to update work order')
    }
  }

  const handleApproveWorkOrder = async (workOrderId: string) => {
    try {
      const response = await fetch('/api/admin/workorders/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId,
          adminId: user?.uid
        })
      })

      if (response.ok) {
        success('Work Order Approved', 'Work order approved successfully!')
      } else {
        const errorData = await response.json()
        error('Approval Failed', errorData.error || 'Failed to approve work order')
      }
    } catch (err) {
      console.error('Error approving work order:', err)
      error('Error', 'Failed to approve work order')
    }
  }

  const handleRejectWorkOrder = async () => {
    if (!selectedWorkOrder || !rejectionReason.trim()) return

    try {
      const response = await fetch('/api/admin/workorders/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: selectedWorkOrder.id,
          adminId: user?.uid,
          reason: rejectionReason
        })
      })

      if (response.ok) {
        success('Work Order Rejected', 'Work order rejected successfully!')
        setShowRejectionModal(false)
        setSelectedWorkOrder(null)
        setRejectionReason('')
      } else {
        const errorData = await response.json()
        error('Rejection Failed', errorData.error || 'Failed to reject work order')
      }
    } catch (err) {
      console.error('Error rejecting work order:', err)
      error('Error', 'Failed to reject work order')
    }
  }

  const handleAssignWorkOrder = async () => {
    if (!selectedWorkOrder || !selectedSubcontractor) return

    setIsAssigning(true)
    try {
      const response = await fetch('/api/admin/workorders/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: selectedWorkOrder.id,
          subcontractorId: selectedSubcontractor,
          adminId: user?.uid
        })
      })

      if (response.ok) {
        success('Work Order Assigned', 'Work order assigned successfully!')
        setShowAssignmentModal(false)
        setSelectedWorkOrder(null)
        setSelectedSubcontractor('')
      } else {
        const errorData = await response.json()
        error('Assignment Failed', errorData.error || 'Failed to assign work order')
      }
    } catch (err) {
      console.error('Error assigning work order:', err)
      error('Error', 'Failed to assign work order')
    } finally {
      setIsAssigning(false)
    }
  }

  const handleDeleteWorkOrder = async (workOrderId: string) => {
    if (!confirm('Are you sure you want to delete this work order?')) return

    try {
      await deleteDoc(doc(db, 'workorders', workOrderId))
      success('Work Order Deleted', 'Work order deleted successfully!')
    } catch (err) {
      console.error('Error deleting work order:', err)
      error('Error', 'Failed to delete work order')
    }
  }

  const fetchSubcontractors = async () => {
    try {
      const response = await fetch('/api/admin/workorders/assign')
      const data = await response.json()
      if (data.success) {
        setSubcontractors(data.subcontractors)
      }
    } catch (err) {
      console.error('Error fetching subcontractors:', err)
    }
  }

  const openAssignmentModal = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder)
    setShowAssignmentModal(true)
    fetchSubcontractors()
  }

  const openRejectionModal = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder)
    setShowRejectionModal(true)
  }

  const openQuoteModal = (workOrder: WorkOrder) => {
    setSelectedWorkOrderForQuote(workOrder)
    setShowQuoteModal(true)
  }

  const handleCreateQuote = async (quoteData: any) => {
    try {
      const response = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...quoteData,
          adminId: user?.uid,
          adminName: profile?.fullName,
          adminEmail: profile?.email
        })
      })

      if (response.ok) {
        success('Quote Created', 'Quote created successfully!')
        setShowQuoteModal(false)
        setSelectedWorkOrderForQuote(null)
      } else {
        const errorData = await response.json()
        error('Quote Creation Failed', errorData.error || 'Failed to create quote')
      }
    } catch (err) {
      console.error('Error creating quote:', err)
      error('Error', 'Failed to create quote')
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
                         workOrder.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || workOrder.status === filterStatus
    const matchesCategory = filterCategory === 'all' || workOrder.category === filterCategory
    const matchesPriority = filterPriority === 'all' || workOrder.priority === filterPriority
    
    return matchesSearch && matchesStatus && matchesCategory && matchesPriority
  })

  const stats = {
    total: workOrders.length,
    pending: workOrders.filter(w => w.status === 'pending').length,
    approved: workOrders.filter(w => w.status === 'approved').length,
    inProgress: workOrders.filter(w => w.status === 'in-progress').length,
    completed: workOrders.filter(w => w.status === 'completed').length
  }


  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Work Orders Management</h1>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Work Order
          </Button>
        </div>

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Orders List */}
      <div className="space-y-4">
        {filteredWorkOrders.map((workOrder) => (
          <Card key={workOrder.id}>
            <CardHeader>
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                <div className="flex-1">
                  <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                    <span className="text-lg font-semibold break-words">{workOrder.title}</span>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={`${getStatusBadge(workOrder.status)} text-xs`}>
                        {workOrder.status}
                      </Badge>
                      <Badge className={`${getPriorityBadge(workOrder.priority)} text-xs`}>
                        {workOrder.priority}
                      </Badge>
                    </div>
                  </CardTitle>
                  <p className="text-sm text-gray-600 line-clamp-2">{workOrder.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workOrder.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApproveWorkOrder(workOrder.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openRejectionModal(workOrder)}
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  {workOrder.status === 'approved' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => openQuoteModal(workOrder)}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Calculator className="w-4 h-4 mr-1" />
                        Create Quote
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openAssignmentModal(workOrder)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Assign
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setViewingWorkOrder(workOrder)
                      setShowViewModal(true)
                    }}
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingWorkOrder(workOrder)
                      setShowEditForm(true)
                    }}
                    title="Edit Work Order"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteWorkOrder(workOrder.id)}
                    className="text-red-600 hover:bg-red-50"
                    title="Delete Work Order"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{workOrder.location.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>${workOrder.estimatedCost || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>{workOrder.estimatedDuration || 0}h</span>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600 space-y-1">
                <p><strong>Client:</strong> <span className="break-words">{workOrder.clientName}</span></p>
                <p><strong>Category:</strong> <span className="capitalize">{workOrder.category}</span></p>
                {workOrder.assignedToName && (
                  <p><strong>Assigned to:</strong> <span className="break-words">{workOrder.assignedToName}</span></p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Work Order Modal */}
      <CreateWorkOrderModal
        isOpen={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        onSubmit={handleCreateWorkOrder}
        isSubmitting={false}
        locations={locations}
      />

      {/* Edit Work Order Modal */}
      <EditWorkOrderModal
        isOpen={showEditForm}
        onClose={() => {
          setShowEditForm(false)
          setEditingWorkOrder(null)
        }}
        onSubmit={handleEditWorkOrder}
        isSubmitting={false}
        locations={locations}
        workOrder={editingWorkOrder}
      />

      {/* View Work Order Modal */}
      <ViewWorkOrderModal
        isOpen={showViewModal}
        onClose={() => {
          setShowViewModal(false)
          setViewingWorkOrder(null)
        }}
        workOrder={viewingWorkOrder}
      />

      {/* Create Quote Modal */}
      <CreateQuoteModal
        isOpen={showQuoteModal}
        onClose={() => {
          setShowQuoteModal(false)
          setSelectedWorkOrderForQuote(null)
        }}
        onSubmit={handleCreateQuote}
        isSubmitting={false}
        workOrder={selectedWorkOrderForQuote}
      />

      {/* Assignment Modal */}
      {showAssignmentModal && selectedWorkOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Assign Work Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="subcontractor">Select Subcontractor</Label>
                <Select value={selectedSubcontractor} onValueChange={setSelectedSubcontractor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose subcontractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcontractors.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.fullName} ({sub.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAssignmentModal(false)
                    setSelectedWorkOrder(null)
                    setSelectedSubcontractor('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAssignWorkOrder}
                  disabled={!selectedSubcontractor || isAssigning}
                >
                  {isAssigning ? 'Assigning...' : 'Assign'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && selectedWorkOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Reject Work Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="reason">Rejection Reason</Label>
                <Textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Please provide a reason for rejection..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectionModal(false)
                    setSelectedWorkOrder(null)
                    setRejectionReason('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRejectWorkOrder}
                  disabled={!rejectionReason.trim()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Reject Work Order
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </>
  )
}
