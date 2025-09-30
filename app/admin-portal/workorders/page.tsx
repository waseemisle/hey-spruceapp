'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Modal from '@/components/ui/modal'
import { useAuth } from '@/lib/auth'
import { WorkOrder, Quote, Client, Subcontractor, Category } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Search, 
  Plus,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  MapPin,
  Users,
  FileText,
  Send,
  Trash2
} from 'lucide-react'

export default function AdminWorkOrdersPage() {
  const { user } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterClient, setFilterClient] = useState('all')
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showGetEstimatesModal, setShowGetEstimatesModal] = useState(false)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null)
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clientId: '',
    categoryId: '',
    locationId: '',
    estimatedCost: '',
    estimatedDateOfService: ''
  })

  const [selectedSubcontractors, setSelectedSubcontractors] = useState<string[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Fetch all data in parallel
      const [workOrdersRes, quotesRes, clientsRes, subcontractorsRes, categoriesRes] = await Promise.all([
        fetch('/api/workorders'),
        fetch('/api/quotes'),
        fetch('/api/admin/clients'),
        fetch('/api/admin/subcontractors'),
        fetch('/api/categories')
      ])

      if (workOrdersRes.ok) {
        const workOrdersData = await workOrdersRes.json()
        setWorkOrders(workOrdersData)
      }

      if (quotesRes.ok) {
        const quotesData = await quotesRes.json()
        setQuotes(quotesData)
      }

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json()
        setClients(clientsData.filter((c: Client) => c.status === 'approved'))
      }

      if (subcontractorsRes.ok) {
        const subcontractorsData = await subcontractorsRes.json()
        setSubcontractors(subcontractorsData.filter((s: Subcontractor) => s.status === 'approved'))
      }

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json()
        setCategories(categoriesData.filter((c: Category) => c.isActive))
      }

    } catch (err) {
      console.error('Error fetching data:', err)
      error('Fetch Error', 'Failed to load data')
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
    
    if (!formData.title || !formData.description || !formData.clientId || !formData.categoryId || !formData.estimatedCost || !formData.estimatedDateOfService) {
      error('Validation Error', 'Please fill in all required fields')
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
          createdBy: user?.uid
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create work order')
      }

      success('Work Order Created', 'Work order created successfully!')
      setShowCreateModal(false)
      setFormData({
        title: '',
        description: '',
        clientId: '',
        categoryId: '',
        locationId: '',
        estimatedCost: '',
        estimatedDateOfService: ''
      })
      fetchData()
    } catch (err: any) {
      error('Creation Failed', err.message)
    }
  }

  const handleGetEstimates = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder)
    setShowGetEstimatesModal(true)
  }

  const handleSelectSubcontractors = async () => {
    if (!selectedWorkOrder || selectedSubcontractors.length === 0) {
      error('Selection Required', 'Please select at least one subcontractor')
      return
    }

    try {
      const response = await fetch(`/api/workorders/${selectedWorkOrder.id}/get-estimates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subcontractorIds: selectedSubcontractors
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send estimates request')
      }

      success('Estimates Request Sent', 'Estimate requests sent to selected subcontractors!')
      setShowGetEstimatesModal(false)
      setSelectedSubcontractors([])
      fetchData()
    } catch (err: any) {
      error('Request Failed', err.message)
    }
  }

  const handleShareQuoteWithClient = async (quote: Quote) => {
    try {
      const response = await fetch(`/api/quotes/${quote.id}/share-with-client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to share quote with client')
      }

      success('Quote Shared', 'Quote has been shared with the client!')
      fetchData()
    } catch (err: any) {
      error('Share Failed', err.message)
    }
  }

  const handleAssignWorkOrder = async (workOrder: WorkOrder) => {
    const quote = quotes.find(q => q.workOrderId === workOrder.id && q.status === 'accepted')
    if (!quote) {
      error('No Accepted Quote', 'No accepted quote found for this work order')
      return
    }

    try {
      const response = await fetch(`/api/workorders/${workOrder.id}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subcontractorId: quote.subcontractorId
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign work order')
      }

      success('Work Order Assigned', 'Work order has been assigned to subcontractor!')
      fetchData()
    } catch (err: any) {
      error('Assignment Failed', err.message)
    }
  }

  const handleCreateInvoice = async (workOrder: WorkOrder) => {
    const quote = quotes.find(q => q.workOrderId === workOrder.id && q.status === 'accepted')
    if (!quote) {
      error('No Accepted Quote', 'No accepted quote found for this work order')
      return
    }

    try {
      const response = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteId: quote.id,
          workOrderId: workOrder.id
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invoice')
      }

      success('Invoice Created', 'Invoice created and sent to client!')
      fetchData()
    } catch (err: any) {
      error('Invoice Creation Failed', err.message)
    }
  }

  const handleApproveWorkOrder = async (workOrder: WorkOrder) => {
    try {
      const response = await fetch('/api/admin/workorders/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workOrderId: workOrder.id,
          adminId: user?.uid
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve work order')
      }

      success('Work Order Approved', 'Work order has been approved successfully!')
      fetchData()
    } catch (err: any) {
      error('Approval Failed', err.message)
    }
  }

  const handleRejectWorkOrder = async () => {
    if (!selectedWorkOrder || !rejectionReason.trim()) {
      error('Validation Error', 'Please provide a rejection reason')
      return
    }

    try {
      const response = await fetch('/api/admin/workorders/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workOrderId: selectedWorkOrder.id,
          adminId: user?.uid,
          reason: rejectionReason
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject work order')
      }

      success('Work Order Rejected', 'Work order has been rejected')
      setShowRejectModal(false)
      setRejectionReason('')
      fetchData()
    } catch (err: any) {
      error('Rejection Failed', err.message)
    }
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
      clientId: workOrder.clientId,
      categoryId: workOrder.categoryId,
      locationId: workOrder.location?.id || '',
      estimatedCost: workOrder.estimatedCost.toString(),
      estimatedDateOfService: workOrder.estimatedDateOfService
    })
    setShowEditModal(true)
  }

  const handleUpdateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedWorkOrder || !formData.title || !formData.description || !formData.clientId || !formData.categoryId || !formData.estimatedCost || !formData.estimatedDateOfService) {
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
      setFormData({
        title: '',
        description: '',
        clientId: '',
        categoryId: '',
        locationId: '',
        estimatedCost: '',
        estimatedDateOfService: ''
      })
      fetchData()
    } catch (err: any) {
      error('Update Failed', err.message)
    }
  }

  const handleDeleteWorkOrder = async () => {
    if (!selectedWorkOrder) {
      error('Validation Error', 'No work order selected')
      return
    }

    try {
      console.log('Attempting to delete work order:', selectedWorkOrder.id)
      
      const response = await fetch(`/api/workorders/${selectedWorkOrder.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 404) {
          error('Work Order Not Found', 'This work order no longer exists. It may have been deleted by another user.')
        } else {
          throw new Error(data.error || 'Failed to delete work order')
        }
        return
      }

      success('Work Order Deleted', 'Work order has been deleted successfully!')
      setShowDeleteModal(false)
      setSelectedWorkOrder(null)
      fetchData()
    } catch (err: any) {
      console.error('Delete work order error:', err)
      error('Deletion Failed', err.message || 'An unexpected error occurred while deleting the work order')
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

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId)
    return client ? client.fullName : 'Unknown Client'
  }

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    return category ? category.name : 'Unknown Category'
  }

  const getWorkOrderQuotes = (workOrderId: string) => {
    return quotes.filter(q => q.workOrderId === workOrderId)
  }

  const filteredWorkOrders = workOrders.filter(workOrder => {
    const matchesSearch = workOrder.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         getClientName(workOrder.clientId).toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.workOrderNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || workOrder.status === filterStatus
    const matchesClient = filterClient === 'all' || workOrder.clientId === filterClient
    
    return matchesSearch && matchesStatus && matchesClient
  })

  const stats = {
    total: workOrders.length,
    pending: workOrders.filter(w => w.status === 'pending').length,
    inProgress: workOrders.filter(w => ['waiting_for_quote', 'quotes_received', 'quote_sent_to_client', 'assigned', 'in_progress'].includes(w.status)).length,
    completed: workOrders.filter(w => w.status === 'completed').length
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Work Orders Management</h1>
          <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Create Work Order
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={filterClient} onValueChange={setFilterClient}>
                  <SelectTrigger>
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Work Orders List */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Work Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredWorkOrders.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>No work orders found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredWorkOrders.map((workOrder) => {
                    const workOrderQuotes = getWorkOrderQuotes(workOrder.id)
                    const hasAcceptedQuote = workOrderQuotes.some(q => q.status === 'accepted')
                    
                    return (
                      <div key={workOrder.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">
                                {workOrder.workOrderNumber && (
                                  <span className="text-blue-600 font-mono text-sm mr-2">
                                    {workOrder.workOrderNumber}
                                  </span>
                                )}
                                {workOrder.title}
                              </h3>
                              <Badge className={getStatusBadge(workOrder.status)}>
                                {workOrder.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            
                            <p className="text-gray-600 mb-3">{workOrder.description}</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                              <div>
                                <p><strong>Client:</strong> {getClientName(workOrder.clientId)}</p>
                                <p><strong>Category:</strong> {getCategoryName(workOrder.categoryId)}</p>
                                <p><strong>Estimated Cost:</strong> ${workOrder.estimatedCost}</p>
                              </div>
                              <div>
                                <p><strong>Service Date:</strong> {new Date(workOrder.estimatedDateOfService).toLocaleDateString()}</p>
                                <p><strong>Created:</strong> {new Date(workOrder.createdAt).toLocaleDateString()}</p>
                                <p><strong>Quotes:</strong> {workOrderQuotes.length}</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2 ml-4">
                            {/* View Button - Always available */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewWorkOrder(workOrder)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>

                            {/* Edit Button - Available for most statuses except completed/cancelled */}
                            {!['completed', 'cancelled', 'rejected'].includes(workOrder.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditWorkOrder(workOrder)}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            )}

                            {/* Delete Button - Available for all statuses */}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                // Refresh data before showing delete modal to ensure we have latest work order
                                fetchData().then(() => {
                                  const updatedWorkOrder = workOrders.find(wo => wo.id === workOrder.id)
                                  if (updatedWorkOrder) {
                                    setSelectedWorkOrder(updatedWorkOrder)
                                    setShowDeleteModal(true)
                                  } else {
                                    error('Work Order Not Found', 'This work order no longer exists and cannot be deleted.')
                                  }
                                })
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>

                            {/* Approve/Reject Buttons - Only for pending status */}
                            {workOrder.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveWorkOrder(workOrder)}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedWorkOrder(workOrder)
                                    setShowRejectModal(true)
                                  }}
                                  variant="destructive"
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}

                            {/* Status-specific action buttons */}
                            {workOrder.status === 'approved' && (
                              <Button
                                size="sm"
                                onClick={() => handleGetEstimates(workOrder)}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                Get Estimates
                              </Button>
                            )}
                            
                            {workOrder.status === 'quotes_received' && (
                              <Button
                                size="sm"
                                onClick={() => setShowQuoteModal(true)}
                                className="bg-purple-600 hover:bg-purple-700"
                              >
                                <FileText className="w-4 h-4 mr-1" />
                                View Quotes
                              </Button>
                            )}
                            
                            {workOrder.status === 'quote_approved' && hasAcceptedQuote && (
                              <Button
                                size="sm"
                                onClick={() => handleAssignWorkOrder(workOrder)}
                                className="bg-orange-600 hover:bg-orange-700"
                              >
                                Assign Work Order
                              </Button>
                            )}
                            
                            {workOrder.status === 'completed_by_contractor' && (
                              <Button
                                size="sm"
                                onClick={() => handleCreateInvoice(workOrder)}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <DollarSign className="w-4 h-4 mr-1" />
                                Create Invoice
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create Work Order Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create Work Order"
        >
          <form onSubmit={handleCreateWorkOrder} className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
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
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Enter work order description"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientId">Client *</Label>
                <Select value={formData.clientId} onValueChange={(value) => handleInputChange('clientId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.fullName}
                      </SelectItem>
                    ))}
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
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><strong>Status:</strong> <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(selectedWorkOrder.status)}`}>{selectedWorkOrder.status}</span></p>
                    <p><strong>Client:</strong> {getClientName(selectedWorkOrder.clientId)}</p>
                    <p><strong>Category:</strong> {getCategoryName(selectedWorkOrder.categoryId)}</p>
                  </div>
                  <div>
                    <p><strong>Estimated Cost:</strong> ${selectedWorkOrder.estimatedCost}</p>
                    <p><strong>Service Date:</strong> {new Date(selectedWorkOrder.estimatedDateOfService).toLocaleDateString()}</p>
                    <p><strong>Created:</strong> {new Date(selectedWorkOrder.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p><strong>Description:</strong></p>
                  <p className="text-gray-600">{selectedWorkOrder.description}</p>
                </div>
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
          {selectedWorkOrder && (
            <form onSubmit={handleUpdateWorkOrder} className="space-y-4">
              <div>
                <Label htmlFor="edit-title">Title *</Label>
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
                <Input
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Enter work order description"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-clientId">Client *</Label>
                  <Select value={formData.clientId} onValueChange={(value) => handleInputChange('clientId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.fullName}
                        </SelectItem>
                      ))}
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
          )}
        </Modal>

        {/* Reject Work Order Modal */}
        <Modal
          isOpen={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          title="Reject Work Order"
        >
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <h4 className="font-medium text-red-800">Reject Work Order</h4>
              <p className="text-sm text-red-600">Please provide a reason for rejecting this work order.</p>
            </div>

            <div>
              <Label htmlFor="rejectionReason">Rejection Reason *</Label>
              <Input
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection"
                required
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectWorkOrder}
                variant="destructive"
                disabled={!rejectionReason.trim()}
              >
                Reject Work Order
              </Button>
            </div>
          </div>
        </Modal>

        {/* Get Estimates Modal */}
        <Modal
          isOpen={showGetEstimatesModal}
          onClose={() => setShowGetEstimatesModal(false)}
          title="Get Estimates"
        >
          {selectedWorkOrder && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <h4 className="font-medium text-blue-800">{selectedWorkOrder.title}</h4>
                <p className="text-sm text-blue-600">Category: {getCategoryName(selectedWorkOrder.categoryId)}</p>
              </div>

              <div>
                <Label>Select Subcontractors</Label>
                <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
                  {subcontractors
                    .filter(sub => sub.categoryId === selectedWorkOrder.categoryId)
                    .map((subcontractor) => (
                      <div key={subcontractor.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={subcontractor.id}
                          checked={selectedSubcontractors.includes(subcontractor.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSubcontractors(prev => [...prev, subcontractor.id])
                            } else {
                              setSelectedSubcontractors(prev => prev.filter(id => id !== subcontractor.id))
                            }
                          }}
                        />
                        <label htmlFor={subcontractor.id} className="text-sm">
                          {subcontractor.fullName} - {subcontractor.title}
                        </label>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowGetEstimatesModal(false)
                    setSelectedSubcontractors([])
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSelectSubcontractors}
                  disabled={selectedSubcontractors.length === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Send Estimates Request
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
            setSelectedWorkOrder(null)
          }}
          title="Delete Work Order"
        >
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Delete Work Order
              </h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to delete this work order? This action cannot be undone.
              </p>
              {selectedWorkOrder && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{selectedWorkOrder.title}</p>
                  <p className="text-sm text-gray-500">Status: {selectedWorkOrder.status}</p>
                  <p className="text-sm text-gray-500">Client: {getClientName(selectedWorkOrder.clientId)}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedWorkOrder(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteWorkOrder}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Work Order
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  )
}