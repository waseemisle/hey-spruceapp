'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/modal'
import { useAuth } from '@/lib/auth'
import { AssignedWorkOrder } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Search, 
  Wrench,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  Eye,
  CheckCircle,
  FileText
} from 'lucide-react'

export default function SubcontractorAssignedPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [workOrders, setWorkOrders] = useState<AssignedWorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<AssignedWorkOrder | null>(null)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  
  const [completionForm, setCompletionForm] = useState({
    actualCost: '',
    completionNotes: '',
    attachments: [] as File[]
  })

  useEffect(() => {
    if (user?.uid) {
      fetchAssignedWorkOrders()
    }
  }, [user?.uid])

  const fetchAssignedWorkOrders = async () => {
    if (!user?.uid) {
      console.log('No user ID available')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/subcontractor/assigned-workorders?userId=${user.uid}`)
      if (response.ok) {
        const data = await response.json()
        setWorkOrders(data)
      } else {
        error('Fetch Error', 'Failed to load assigned work orders')
      }
    } catch (err) {
      error('Fetch Error', 'Error loading assigned work orders')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setCompletionForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setCompletionForm(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...files]
    }))
  }

  const handleSubmitCompletion = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedWorkOrder) {
      error('Validation Error', 'No work order selected')
      return
    }

    if (!completionForm.completionNotes) {
      error('Validation Error', 'Please provide completion notes')
      return
    }

    try {
      const response = await fetch(`/api/workorders/${selectedWorkOrder.workOrderId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subcontractorId: user?.uid,
          actualCost: completionForm.actualCost ? parseFloat(completionForm.actualCost) : undefined,
          completionNotes: completionForm.completionNotes,
          attachments: completionForm.attachments.map(file => ({
            name: file.name,
            size: file.size,
            type: file.type
          }))
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit work order completion')
      }

      success('Work Order Completed', 'Work order has been marked as completed and submitted for review!')
      setShowCompletionModal(false)
      resetCompletionForm()
      fetchAssignedWorkOrders()
    } catch (err: any) {
      error('Completion Failed', err.message)
    }
  }

  const resetCompletionForm = () => {
    setCompletionForm({
      actualCost: '',
      completionNotes: '',
      attachments: []
    })
  }

  const openCompletionModal = (workOrder: AssignedWorkOrder) => {
    setSelectedWorkOrder(workOrder)
    setCompletionForm(prev => ({
      ...prev,
      actualCost: workOrder.actualCost?.toString() || ''
    }))
    setShowCompletionModal(true)
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      assigned: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'in_progress': return <Clock className="h-4 w-4" />
      case 'cancelled': return <Clock className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const filteredWorkOrders = workOrders.filter(workOrder => {
    const matchesSearch = workOrder.workOrderTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.workOrderDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.clientName?.toLowerCase().includes(searchTerm.toLowerCase())
    
    return matchesSearch
  })

  const stats = {
    total: workOrders.length,
    assigned: workOrders.filter(w => w.status === 'assigned').length,
    inProgress: workOrders.filter(w => w.status === 'in_progress').length,
    completed: workOrders.filter(w => w.status === 'completed').length
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading assigned work orders...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Assigned Work Orders</h1>
          <p className="text-gray-600">Manage your assigned work orders and track progress</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.assigned}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">In Progress</CardTitle>
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

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search work orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
        </div>

        {/* Work Orders List */}
        <div className="space-y-4">
          {filteredWorkOrders.map((workOrder) => (
            <Card key={workOrder.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{workOrder.workOrderTitle}</h3>
                      <Badge className={getStatusBadge(workOrder.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(workOrder.status)}
                          {workOrder.status.replace(/_/g, ' ')}
                        </span>
                      </Badge>
                    </div>
                    
                    <p className="text-gray-600 mb-3">{workOrder.workOrderDescription}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="h-4 w-4" />
                          <span><strong>Location:</strong> {workOrder.workOrderLocation.name}</span>
                        </div>
                        <p><strong>Address:</strong> {workOrder.workOrderLocation.address}</p>
                        <p><strong>Client:</strong> {workOrder.clientName}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="h-4 w-4" />
                          <span><strong>Estimated Cost:</strong> ${workOrder.estimatedCost}</span>
                        </div>
                        {workOrder.actualCost && (
                          <div className="flex items-center gap-2 mb-1">
                            <DollarSign className="h-4 w-4" />
                            <span><strong>Actual Cost:</strong> ${workOrder.actualCost}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span><strong>Service Date:</strong> {new Date(workOrder.estimatedDateOfService).toLocaleDateString()}</span>
                        </div>
                        {workOrder.scheduledDate && (
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="h-4 w-4" />
                            <span><strong>Scheduled:</strong> {new Date(workOrder.scheduledDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                      <p><strong>Assigned:</strong> {new Date(workOrder.assignedAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedWorkOrder(workOrder)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    
                    {(workOrder.status === 'assigned' || workOrder.status === 'in_progress') && (
                      <Button
                        size="sm"
                        onClick={() => openCompletionModal(workOrder)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Mark Complete
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
                <h3 className="text-lg font-medium mb-2">No assigned work orders</h3>
                <p className="text-sm">Work orders will appear here when admin assigns them to you</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completion Modal */}
        <Modal
          isOpen={showCompletionModal}
          onClose={() => setShowCompletionModal(false)}
          title={`Complete Work Order - ${selectedWorkOrder?.workOrderTitle}`}
        >
          <form onSubmit={handleSubmitCompletion} className="space-y-4">
            <div>
              <Label htmlFor="actualCost">Actual Cost (Optional)</Label>
              <Input
                id="actualCost"
                type="number"
                step="0.01"
                value={completionForm.actualCost}
                onChange={(e) => handleInputChange('actualCost', e.target.value)}
                placeholder="Enter actual cost if different from estimate"
              />
            </div>

            <div>
              <Label htmlFor="completionNotes">Completion Notes *</Label>
              <Textarea
                id="completionNotes"
                value={completionForm.completionNotes}
                onChange={(e) => handleInputChange('completionNotes', e.target.value)}
                placeholder="Describe the work completed, any issues encountered, or additional notes"
                rows={4}
                required
              />
            </div>

            <div>
              <Label htmlFor="attachments">Attach Files (Optional)</Label>
              <Input
                id="attachments"
                type="file"
                multiple
                onChange={handleFileUpload}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {completionForm.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {completionForm.attachments.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                      <FileText className="h-4 w-4" />
                      <span>{file.name}</span>
                      <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCompletionModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-4 w-4 mr-2" />
                Submit Completion
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </>
  )
}
