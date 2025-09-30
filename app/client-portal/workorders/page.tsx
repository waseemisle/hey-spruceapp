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
import { WorkOrder, Location, Category } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Plus, 
  Search, 
  Wrench, 
  Calendar,
  DollarSign,
  MapPin,
  Edit,
  Eye,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react'

export default function ClientWorkOrdersPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    categoryId: '',
    locationId: '',
    estimatedCost: '',
    estimatedDateOfService: '',
    notes: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Fetch work orders for this client
      const workOrdersResponse = await fetch(`/api/client/workorders?clientId=${profile?.id}`)
      if (workOrdersResponse.ok) {
        const workOrdersData = await workOrdersResponse.json()
        setWorkOrders(workOrdersData)
      }

      // Fetch approved locations for this client
      const locationsResponse = await fetch(`/api/client/locations?clientId=${profile?.id}`)
      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json()
        // Only show approved locations for work order creation
        setLocations(locationsData.filter((l: Location) => l.status === 'approved'))
      }

      // Fetch categories
      const categoriesResponse = await fetch('/api/categories')
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json()
        setCategories(categoriesData.filter((c: Category) => c.isActive))
      }

    } catch (err) {
      error('Fetch Error', 'Error loading data')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title || !formData.description || !formData.categoryId || !formData.locationId || !formData.estimatedCost || !formData.estimatedDateOfService) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    // Check if selected location is approved
    const selectedLocation = locations.find(l => l.id === formData.locationId)
    if (!selectedLocation || selectedLocation.status !== 'approved') {
      error('Location Error', 'You can only create work orders for approved locations')
      return
    }

    try {
      const response = await fetch('/api/workorders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          estimatedCost: parseFloat(formData.estimatedCost),
          clientId: profile?.id,
          createdBy: user?.uid
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create work order')
      }

      success('Work Order Created', 'Work order created successfully and submitted for admin approval!')
      setShowCreateModal(false)
      resetForm()
      fetchData()
    } catch (err: any) {
      error('Creation Failed', err.message)
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      categoryId: '',
      locationId: '',
      estimatedCost: '',
      estimatedDateOfService: '',
      notes: ''
    })
  }

  const handleViewWorkOrder = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder)
    setShowViewModal(true)
  }

  const handleEditWorkOrder = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder)
    setFormData({
      title: workOrder.title,
      description: workOrder.description,
      priority: workOrder.priority as 'low' | 'medium' | 'high' | 'urgent',
      categoryId: workOrder.categoryId,
      locationId: workOrder.location?.id || '',
      estimatedCost: workOrder.estimatedCost.toString(),
      estimatedDateOfService: workOrder.estimatedDateOfService,
      notes: workOrder.notes || ''
    })
    setShowEditModal(true)
  }

  const handleUpdateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedWorkOrder || !formData.title || !formData.description || !formData.categoryId || !formData.locationId || !formData.estimatedCost || !formData.estimatedDateOfService) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    try {
      const response = await fetch(`/api/workorders/${selectedWorkOrder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          estimatedCost: parseFloat(formData.estimatedCost),
          updatedBy: user?.uid
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update work order')
      }

      success('Work Order Updated', 'Work order updated successfully!')
      setShowEditModal(false)
      resetForm()
      fetchData()
    } catch (err: any) {
      error('Update Failed', err.message)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      waiting_for_quote: 'bg-blue-100 text-blue-800',
      quotes_received: 'bg-purple-100 text-purple-800',
      quote_sent_to_client: 'bg-indigo-100 text-indigo-800',
      quote_approved: 'bg-green-100 text-green-800',
      assigned: 'bg-orange-100 text-orange-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed_by_contractor: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityBadge = (priority: string) => {
    const variants = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    }
    return variants[priority as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const filteredWorkOrders = workOrders.filter(workOrder => {
    const matchesSearch = workOrder.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || workOrder.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: workOrders.length,
    pending: workOrders.filter(w => w.status === 'pending').length,
    inProgress: workOrders.filter(w => ['approved', 'waiting_for_quote', 'quotes_received', 'quote_sent_to_client', 'assigned', 'in_progress'].includes(w.status)).length,
    completed: workOrders.filter(w => w.status === 'completed').length
  }

  const canCreateWorkOrder = locations.some(l => l.status === 'approved')

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading work orders...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Work Orders Management</h1>
          <p className="text-gray-600">Create and track your work orders</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Work Orders</CardTitle>
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
              <CardTitle className="text-sm font-medium text-blue-600">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search work orders..."
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
                <SelectItem value="waiting_for_quote">Waiting for Quote</SelectItem>
                <SelectItem value="quotes_received">Quotes Received</SelectItem>
                <SelectItem value="quote_sent_to_client">Quote Sent to Client</SelectItem>
                <SelectItem value="quote_approved">Quote Approved</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={() => setShowCreateModal(true)} 
            disabled={!canCreateWorkOrder}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Work Order
          </Button>
        </div>

        {!canCreateWorkOrder && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <p className="text-yellow-800">
                <strong>Note:</strong> You need at least one approved location to create work orders. 
                Please wait for admin approval of your locations.
              </p>
            </div>
          </div>
        )}

        {/* Work Orders List */}
        <div className="space-y-4">
          {filteredWorkOrders.map((workOrder) => (
            <Card key={workOrder.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{workOrder.title}</h3>
                      <Badge className={getStatusBadge(workOrder.status)}>
                        {workOrder.status.replace(/_/g, ' ')}
                      </Badge>
                      <Badge className={getPriorityBadge(workOrder.priority)}>
                        {workOrder.priority}
                      </Badge>
                    </div>
                    
                    <p className="text-gray-600 mb-3">{workOrder.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <p><strong>Category:</strong> {workOrder.categoryName}</p>
                        <p><strong>Location:</strong> {workOrder.location.name}</p>
                        <p><strong>Estimated Cost:</strong> ${workOrder.estimatedCost}</p>
                      </div>
                      <div>
                        <p><strong>Service Date:</strong> {new Date(workOrder.estimatedDateOfService).toLocaleDateString()}</p>
                        <p><strong>Created:</strong> {new Date(workOrder.createdAt).toLocaleDateString()}</p>
                        {workOrder.assignedToName && (
                          <p><strong>Assigned To:</strong> {workOrder.assignedToName}</p>
                        )}
                      </div>
                    </div>

                    {workOrder.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-600">
                          <strong>Notes:</strong> {workOrder.notes}
                        </p>
                      </div>
                    )}

                    {workOrder.rejectionReason && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                        <p className="text-sm text-red-700">
                          <strong>Rejection Reason:</strong> {workOrder.rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewWorkOrder(workOrder)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>

                    {/* Edit button only available for pending status work orders */}
                    {workOrder.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditWorkOrder(workOrder)}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredWorkOrders.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <div className="text-gray-500 mb-4">
                <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No work orders found</h3>
                <p className="text-sm">Create your first work order to get started</p>
              </div>
              <Button 
                onClick={() => setShowCreateModal(true)} 
                disabled={!canCreateWorkOrder}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Work Order
              </Button>
            </CardContent>
          </Card>
        )}

        {/* View Work Order Modal */}
        <Modal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          title="View Work Order"
        >
          {selectedWorkOrder && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">{selectedWorkOrder.title}</h3>
                <div className="flex items-center gap-3 mb-3">
                  <Badge className={getStatusBadge(selectedWorkOrder.status)}>
                    {selectedWorkOrder.status.replace(/_/g, ' ')}
                  </Badge>
                  <Badge className={getPriorityBadge(selectedWorkOrder.priority)}>
                    {selectedWorkOrder.priority}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><strong>Category:</strong> {selectedWorkOrder.categoryName}</p>
                    <p><strong>Location:</strong> {selectedWorkOrder.location.name}</p>
                    <p><strong>Estimated Cost:</strong> ${selectedWorkOrder.estimatedCost}</p>
                  </div>
                  <div>
                    <p><strong>Service Date:</strong> {new Date(selectedWorkOrder.estimatedDateOfService).toLocaleDateString()}</p>
                    <p><strong>Created:</strong> {new Date(selectedWorkOrder.createdAt).toLocaleDateString()}</p>
                    {selectedWorkOrder.assignedToName && (
                      <p><strong>Assigned To:</strong> {selectedWorkOrder.assignedToName}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <p><strong>Description:</strong></p>
                  <p className="text-gray-600">{selectedWorkOrder.description}</p>
                </div>
                {selectedWorkOrder.notes && (
                  <div className="mt-3">
                    <p><strong>Notes:</strong></p>
                    <p className="text-gray-600">{selectedWorkOrder.notes}</p>
                  </div>
                )}
                {selectedWorkOrder.rejectionReason && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                    <p className="text-sm text-red-700">
                      <strong>Rejection Reason:</strong> {selectedWorkOrder.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setShowViewModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Edit Work Order Modal */}
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit Work Order"
        >
          <form onSubmit={handleUpdateWorkOrder} className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Work Order Title *</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter work order title"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Description *</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe the work needed"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-priority">Priority *</Label>
                <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit-categoryId">Category *</Label>
                <Select value={formData.categoryId} onValueChange={(value) => handleInputChange('categoryId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-locationId">Location *</Label>
              <Select value={formData.locationId} onValueChange={(value) => handleInputChange('locationId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter(location => location.status === 'approved')
                    .map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name} - {location.address}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-estimatedCost">Estimated Cost *</Label>
                <Input
                  id="edit-estimatedCost"
                  type="number"
                  value={formData.estimatedCost}
                  onChange={(e) => handleInputChange('estimatedCost', e.target.value)}
                  placeholder="Enter estimated cost"
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit-estimatedDateOfService">Service Date *</Label>
                <Input
                  id="edit-estimatedDateOfService"
                  type="date"
                  value={formData.estimatedDateOfService}
                  onChange={(e) => handleInputChange('estimatedDateOfService', e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes or special instructions"
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
                Update Work Order
              </Button>
            </div>
          </form>
        </Modal>

        {/* Create Work Order Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create New Work Order"
        >
          <form onSubmit={handleCreateWorkOrder} className="space-y-4">
            <div>
              <Label htmlFor="title">Work Order Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter work order title"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe the work needed"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Priority *</Label>
                <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="categoryId">Category *</Label>
                <Select value={formData.categoryId} onValueChange={(value) => handleInputChange('categoryId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="locationId">Location *</Label>
              <Select value={formData.locationId} onValueChange={(value) => handleInputChange('locationId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter(location => location.status === 'approved')
                    .map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name} - {location.address}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimatedCost">Estimated Cost *</Label>
                <Input
                  id="estimatedCost"
                  type="number"
                  value={formData.estimatedCost}
                  onChange={(e) => handleInputChange('estimatedCost', e.target.value)}
                  placeholder="Enter estimated cost"
                  required
                />
              </div>

              <div>
                <Label htmlFor="estimatedDateOfService">Service Date *</Label>
                <Input
                  id="estimatedDateOfService"
                  type="date"
                  value={formData.estimatedDateOfService}
                  onChange={(e) => handleInputChange('estimatedDateOfService', e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes or special instructions"
                rows={3}
              />
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
                Create Work Order
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </>
  )
}