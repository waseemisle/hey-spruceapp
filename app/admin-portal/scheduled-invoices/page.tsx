'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { useLoading } from '@/contexts/LoadingContext'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { ScheduledInvoice, UserProfile } from '@/lib/types'
import CreateScheduledInvoiceModal from '@/components/modals/CreateScheduledInvoiceModal'
import WithRoleProtection from '@/components/auth/withRoleProtection'
import { 
  Plus, 
  Search, 
  Calendar,
  Clock,
  DollarSign,
  User,
  Play,
  Pause,
  Edit,
  Trash2,
  Eye
} from 'lucide-react'

export default function AdminScheduledInvoicesPage() {
  return (
    <WithRoleProtection 
      allowedRoles={['admin']}
      fallbackMessage="This scheduled invoices page is only accessible to administrators."
    >
      <AdminScheduledInvoicesContent />
    </WithRoleProtection>
  )
}

function AdminScheduledInvoicesContent() {
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  const { setLoading } = useLoading()
  const [scheduledInvoices, setScheduledInvoices] = useState<ScheduledInvoice[]>([])
  const [clients, setClients] = useState<UserProfile[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchScheduledInvoices()
    fetchClients()
  }, [])

  const fetchScheduledInvoices = async () => {
    try {
      const response = await fetch('/api/admin/scheduled-invoices')
      const data = await response.json()
      
      if (data.success) {
        setScheduledInvoices(data.scheduledInvoices)
      } else {
        error('Error', 'Failed to fetch scheduled invoices')
      }
    } catch (err) {
      console.error('Error fetching scheduled invoices:', err)
      error('Error', 'Failed to fetch scheduled invoices')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchClients = async () => {
    try {
      // Fetch clients from users collection
      const response = await fetch('/api/admin/list-registrations')
      const data = await response.json()
      
      if (data.success) {
        // Filter only approved clients and map to UserProfile format
        const approvedClients = data.registrations
          .filter((reg: any) => reg.status === 'approved')
          .map((reg: any) => ({
            id: reg.userId,
            email: reg.email,
            fullName: reg.contactPerson,
            role: 'client' as const,
            createdAt: reg.submittedAt,
            updatedAt: reg.approvedAt || reg.submittedAt
          }))
        setClients(approvedClients)
      }
    } catch (err) {
      console.error('Error fetching clients:', err)
    }
  }

  const handleCreateScheduledInvoice = async (formData: any) => {
    try {
      setLoading(true)
      
      const response = await fetch('/api/admin/scheduled-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          adminId: user?.uid,
          adminName: profile?.fullName,
          adminEmail: profile?.email
        })
      })

      if (response.ok) {
        const result = await response.json()
        success('Scheduled Invoice Created', 'Scheduled invoice created successfully!')
        setShowCreateModal(false)
        fetchScheduledInvoices() // Refresh the list
      } else {
        const errorData = await response.json()
        error('Creation Failed', errorData.error || 'Failed to create scheduled invoice')
      }
    } catch (err) {
      console.error('Error creating scheduled invoice:', err)
      error('Error', 'Failed to create scheduled invoice')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (scheduledInvoice: ScheduledInvoice) => {
    try {
      setLoading(true)
      
      const response = await fetch(`/api/admin/scheduled-invoices/${scheduledInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !scheduledInvoice.isActive
        })
      })

      if (response.ok) {
        success(
          'Status Updated', 
          `Scheduled invoice ${scheduledInvoice.isActive ? 'paused' : 'activated'} successfully!`
        )
        fetchScheduledInvoices() // Refresh the list
      } else {
        const errorData = await response.json()
        error('Update Failed', errorData.error || 'Failed to update scheduled invoice')
      }
    } catch (err) {
      console.error('Error updating scheduled invoice:', err)
      error('Error', 'Failed to update scheduled invoice')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (scheduledInvoice: ScheduledInvoice) => {
    if (!confirm('Are you sure you want to delete this scheduled invoice?')) return

    try {
      setLoading(true)
      
      const response = await fetch(`/api/admin/scheduled-invoices/${scheduledInvoice.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        success('Scheduled Invoice Deleted', 'Scheduled invoice deleted successfully!')
        fetchScheduledInvoices() // Refresh the list
      } else {
        const errorData = await response.json()
        error('Deletion Failed', errorData.error || 'Failed to delete scheduled invoice')
      }
    } catch (err) {
      console.error('Error deleting scheduled invoice:', err)
      error('Error', 'Failed to delete scheduled invoice')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-gray-100 text-gray-800'
  }

  const getFrequencyBadge = (frequency: string) => {
    const variants = {
      weekly: 'bg-blue-100 text-blue-800',
      monthly: 'bg-purple-100 text-purple-800',
      quarterly: 'bg-orange-100 text-orange-800',
      yearly: 'bg-red-100 text-red-800'
    }
    return variants[frequency as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const formatNextExecution = (nextExecution?: string) => {
    if (!nextExecution) return 'Not scheduled'
    const date = new Date(nextExecution)
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  }

  const filteredScheduledInvoices = scheduledInvoices.filter(invoice => {
    const matchesSearch = invoice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.clientEmail.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && invoice.isActive) ||
                         (filterStatus === 'inactive' && !invoice.isActive)
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: scheduledInvoices.length,
    active: scheduledInvoices.filter(s => s.isActive).length,
    inactive: scheduledInvoices.filter(s => !s.isActive).length,
    totalValue: scheduledInvoices.reduce((sum, s) => sum + s.amount, 0)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading scheduled invoices...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Scheduled Invoices</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Scheduled Invoice
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <CardTitle className="text-sm font-medium text-green-600">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Inactive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inactive}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalValue.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search scheduled invoices..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scheduled Invoices List */}
        <div className="space-y-4">
          {filteredScheduledInvoices.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Scheduled Invoices</h3>
                <p className="text-gray-600 mb-4">Get started by creating your first scheduled invoice.</p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Scheduled Invoice
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredScheduledInvoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardHeader>
                  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                    <div className="flex-1">
                      <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                        <span className="text-lg font-semibold">{invoice.title}</span>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={`${getStatusBadge(invoice.isActive)} text-xs`}>
                            {invoice.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge className={`${getFrequencyBadge(invoice.frequency)} text-xs`}>
                            {invoice.frequency.charAt(0).toUpperCase() + invoice.frequency.slice(1)}
                          </Badge>
                        </div>
                      </CardTitle>
                      <p className="text-sm text-gray-600 line-clamp-2">{invoice.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(invoice)}
                        className={invoice.isActive ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}
                      >
                        {invoice.isActive ? (
                          <>
                            <Pause className="w-4 h-4 mr-1" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(invoice)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{invoice.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>${invoice.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{invoice.time} {invoice.timezone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-xs">{formatNextExecution(invoice.nextExecution)}</span>
                    </div>
                  </div>
                  {invoice.notes && (
                    <div className="mt-3 text-sm text-gray-600">
                      <strong>Notes:</strong> {invoice.notes}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Create Scheduled Invoice Modal */}
        <CreateScheduledInvoiceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateScheduledInvoice}
          isSubmitting={false}
          clients={clients}
        />
      </div>
    </>
  )
}
