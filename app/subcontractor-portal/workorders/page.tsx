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
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { WorkOrder } from '@/lib/types'
import { 
  Search, 
  Clock,
  DollarSign,
  MapPin,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'

export default function SubcontractorWorkOrdersPage() {
  const { user } = useAuth()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  // Update work order status modal
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')
  const [actualCost, setActualCost] = useState(0)
  const [actualDuration, setActualDuration] = useState(0)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    if (!user?.uid) return

    // Fetch work orders assigned to this subcontractor
    const workOrdersQuery = query(
      collection(db, 'workorders'),
      where('assignedTo', '==', user.uid)
    )
    
    const unsubscribeWorkOrders = onSnapshot(workOrdersQuery, (snapshot) => {
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkOrder[]
      
      // Sort by createdAt manually since we can't use orderBy in the query
      workOrdersData.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return dateB - dateA // Descending order
      })
      
      console.log('Work orders found for subcontractor:', workOrdersData.length)
      console.log('Work orders data:', workOrdersData)
      setWorkOrders(workOrdersData)
    }, (error) => {
      console.error('Error fetching work orders:', error)
    })

    return () => {
      unsubscribeWorkOrders()
    }
  }, [user?.uid])

  const handleUpdateStatus = async () => {
    if (!selectedWorkOrder || !newStatus) return

    setIsUpdating(true)
    try {
      const updateData: any = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      }

      if (newStatus === 'completed') {
        updateData.completedDate = new Date().toISOString()
        updateData.actualCost = actualCost
        updateData.actualDuration = actualDuration
        if (completionNotes.trim()) {
          updateData.completionNotes = completionNotes.trim()
        }
      }

      await updateDoc(doc(db, 'workorders', selectedWorkOrder.id), updateData)
      
      alert('Work order status updated successfully!')
      setShowStatusModal(false)
      setSelectedWorkOrder(null)
      setNewStatus('')
      setCompletionNotes('')
      setActualCost(0)
      setActualDuration(0)
    } catch (error) {
      console.error('Error updating work order status:', error)
      alert('Failed to update work order status')
    } finally {
      setIsUpdating(false)
    }
  }

  const openStatusModal = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder)
    setNewStatus(workOrder.status)
    setActualCost(workOrder.actualCost || 0)
    setActualDuration(workOrder.actualDuration || 0)
    setShowStatusModal(true)
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
    
    return matchesSearch && matchesStatus && matchesCategory
  })

  const stats = {
    total: workOrders.length,
    inProgress: workOrders.filter(w => w.status === 'in-progress').length,
    completed: workOrders.filter(w => w.status === 'completed').length,
    pending: workOrders.filter(w => w.status === 'approved').length
  }


  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">My Assigned Work Orders</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Ready to Start</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
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
                  <SelectItem value="approved">Ready to Start</SelectItem>
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

      {/* Work Orders List */}
      <div className="space-y-4">
        {filteredWorkOrders.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No work orders assigned to you yet.</p>
                <p className="text-sm mt-2">Work orders will appear here once an admin assigns them to you.</p>
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
                  <Button
                    size="sm"
                    onClick={() => openStatusModal(workOrder)}
                    variant={workOrder.status === 'completed' ? 'outline' : 'default'}
                  >
                    {workOrder.status === 'completed' ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        View Details
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 mr-1" />
                        Update Status
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span>{workOrder.location.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <span>Est: ${workOrder.estimatedCost || 0}</span>
                    {workOrder.actualCost && (
                      <span className="text-green-600">Actual: ${workOrder.actualCost}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>Est: {workOrder.estimatedDuration || 0}h</span>
                    {workOrder.actualDuration && (
                      <span className="text-green-600">Actual: {workOrder.actualDuration}h</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span>{workOrder.clientName}</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <p><strong>Category:</strong> {workOrder.category}</p>
                    <p><strong>Assigned:</strong> {new Date(workOrder.assignedAt || workOrder.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    {workOrder.scheduledDate && (
                      <p><strong>Scheduled:</strong> {new Date(workOrder.scheduledDate).toLocaleDateString()}</p>
                    )}
                    {workOrder.completedDate && (
                      <p><strong>Completed:</strong> {new Date(workOrder.completedDate).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>

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

      {/* Status Update Modal */}
      {showStatusModal && selectedWorkOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Update Work Order Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Ready to Start</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newStatus === 'completed' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="actualCost">Actual Cost ($)</Label>
                      <Input
                        id="actualCost"
                        type="number"
                        step="0.01"
                        value={actualCost}
                        onChange={(e) => setActualCost(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="actualDuration">Actual Duration (hours)</Label>
                      <Input
                        id="actualDuration"
                        type="number"
                        step="0.5"
                        value={actualDuration}
                        onChange={(e) => setActualDuration(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="completionNotes">Completion Notes</Label>
                    <Textarea
                      id="completionNotes"
                      value={completionNotes}
                      onChange={(e) => setCompletionNotes(e.target.value)}
                      placeholder="Add any notes about the completion..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowStatusModal(false)
                    setSelectedWorkOrder(null)
                    setNewStatus('')
                    setCompletionNotes('')
                    setActualCost(0)
                    setActualDuration(0)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateStatus}
                  disabled={!newStatus || isUpdating}
                >
                  {isUpdating ? 'Updating...' : 'Update Status'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
