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
import { ScheduledInvoice, UserProfile } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Plus, 
  Search, 
  Calendar,
  Clock,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  DollarSign,
  Eye,
  Mail
} from 'lucide-react'

export default function AdminScheduledInvoicesPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [scheduledInvoices, setScheduledInvoices] = useState<ScheduledInvoice[]>([])
  const [clients, setClients] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showSendEmailModal, setShowSendEmailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<ScheduledInvoice | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  
  const [formData, setFormData] = useState({
    clientId: '',
    title: '',
    description: '',
    amount: '',
    frequency: 'weekly' as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    dayOfWeek: '',
    dayOfMonth: '',
    time: '',
    timezone: 'America/New_York',
    notes: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Fetch scheduled invoices
      const invoicesResponse = await fetch('/api/scheduled-invoices')
      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json()
        setScheduledInvoices(invoicesData)
      }

      // Fetch approved clients
      const clientsResponse = await fetch('/api/admin/clients/approved')
      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json()
        setClients(clientsData)
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

  const handleCreateScheduledInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.clientId || !formData.title || !formData.amount || !formData.time) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    // Validate frequency-specific fields
    if (formData.frequency === 'weekly' && !formData.dayOfWeek) {
      error('Validation Error', 'Please select a day of the week for weekly invoices')
      return
    }

    if ((formData.frequency === 'monthly' || formData.frequency === 'quarterly' || formData.frequency === 'yearly') && !formData.dayOfMonth) {
      error('Validation Error', 'Please select a day of the month for monthly/quarterly/yearly invoices')
      return
    }

    try {
      // Find selected client to get name and email
      const selectedClient = clients.find(c => c.id === formData.clientId)
      
      if (!selectedClient) {
        error('Validation Error', 'Selected client not found')
        return
      }

      const response = await fetch('/api/scheduled-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          clientName: selectedClient.fullName,
          clientEmail: selectedClient.email,
          amount: parseFloat(formData.amount),
          dayOfWeek: formData.frequency === 'weekly' ? parseInt(formData.dayOfWeek) : null,
          dayOfMonth: ['monthly', 'quarterly', 'yearly'].includes(formData.frequency) ? parseInt(formData.dayOfMonth) : null,
          createdBy: user?.uid
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create scheduled invoice')
      }

      success('Scheduled Invoice Created', 'Scheduled invoice created successfully!')
      setShowCreateModal(false)
      resetForm()
      fetchData()
    } catch (err: any) {
      error('Creation Failed', err.message)
    }
  }

  const handleToggleActive = async (invoiceId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/scheduled-invoices/${invoiceId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isActive: !currentStatus
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to toggle scheduled invoice')
      }

      success('Status Updated', `Scheduled invoice ${!currentStatus ? 'activated' : 'deactivated'} successfully!`)
      fetchData()
    } catch (err: any) {
      error('Toggle Failed', err.message)
    }
  }

  const handleDeleteScheduledInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this scheduled invoice?')) {
      return
    }

    try {
      const response = await fetch(`/api/scheduled-invoices/${invoiceId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete scheduled invoice')
      }

      success('Scheduled Invoice Deleted', 'Scheduled invoice deleted successfully!')
      fetchData()
    } catch (err: any) {
      error('Deletion Failed', err.message)
    }
  }

  const openSendEmailModal = (invoice: ScheduledInvoice) => {
    setSelectedInvoice(invoice)
    setShowSendEmailModal(true)
  }

  const handleConfirmSendEmail = async () => {
    if (!selectedInvoice) return

    setSendingEmail(true)
    
    try {
      const response = await fetch(`/api/scheduled-invoices/${selectedInvoice.id}/send-email`, {
        method: 'POST'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email')
      }

      success('Email Sent', `Invoice email sent successfully to ${selectedInvoice.clientEmail}`)
      setShowSendEmailModal(false)
      setSelectedInvoice(null)
    } catch (err: any) {
      error('Email Failed', err.message)
    } finally {
      setSendingEmail(false)
    }
  }

  const resetForm = () => {
    setFormData({
      clientId: '',
      title: '',
      description: '',
      amount: '',
      frequency: 'weekly',
      dayOfWeek: '',
      dayOfMonth: '',
      time: '',
      timezone: 'America/New_York',
      notes: ''
    })
  }

  const openViewModal = (invoice: ScheduledInvoice) => {
    setSelectedInvoice(invoice)
    setShowViewModal(true)
  }

  const openEditModal = (invoice: ScheduledInvoice) => {
    setSelectedInvoice(invoice)
    setFormData({
      clientId: invoice.clientId,
      title: invoice.title,
      description: invoice.description || '',
      amount: invoice.amount.toString(),
      frequency: invoice.frequency,
      dayOfWeek: invoice.dayOfWeek != null ? invoice.dayOfWeek.toString() : '',
      dayOfMonth: invoice.dayOfMonth != null ? invoice.dayOfMonth.toString() : '',
      time: invoice.time,
      timezone: invoice.timezone,
      notes: invoice.notes || ''
    })
    setShowEditModal(true)
  }

  const handleEditScheduledInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedInvoice) {
      error('Error', 'No invoice selected')
      return
    }

    if (!formData.clientId || !formData.title || !formData.amount || !formData.time) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    if (formData.frequency === 'weekly' && !formData.dayOfWeek) {
      error('Validation Error', 'Please select a day of the week for weekly invoices')
      return
    }

    if ((formData.frequency === 'monthly' || formData.frequency === 'quarterly' || formData.frequency === 'yearly') && !formData.dayOfMonth) {
      error('Validation Error', 'Please select a day of the month for monthly/quarterly/yearly invoices')
      return
    }

    try {
      // Find selected client to get name and email
      const selectedClient = clients.find(c => c.id === formData.clientId)
      
      if (!selectedClient) {
        error('Validation Error', 'Selected client not found')
        return
      }

      const response = await fetch(`/api/scheduled-invoices/${selectedInvoice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          clientName: selectedClient.fullName,
          clientEmail: selectedClient.email,
          amount: parseFloat(formData.amount),
          dayOfWeek: formData.frequency === 'weekly' ? parseInt(formData.dayOfWeek) : null,
          dayOfMonth: ['monthly', 'quarterly', 'yearly'].includes(formData.frequency) ? parseInt(formData.dayOfMonth) : null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update scheduled invoice')
      }

      success('Scheduled Invoice Updated', 'Scheduled invoice updated successfully!')
      setShowEditModal(false)
      setSelectedInvoice(null)
      resetForm()
      fetchData()
    } catch (err: any) {
      error('Update Failed', err.message)
    }
  }

  const getStatusBadge = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800'
  }

  const getFrequencyBadge = (frequency: string) => {
    const variants = {
      weekly: 'bg-blue-100 text-blue-800',
      monthly: 'bg-purple-100 text-purple-800',
      quarterly: 'bg-orange-100 text-orange-800',
      yearly: 'bg-gray-100 text-gray-800'
    }
    return variants[frequency as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getDayOfWeekName = (day: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return days[day]
  }

  const filteredInvoices = scheduledInvoices.filter(invoice => {
    const matchesSearch = invoice.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.description?.toLowerCase().includes(searchTerm.toLowerCase())
    
    return matchesSearch
  })

  const stats = {
    total: scheduledInvoices.length,
    active: scheduledInvoices.filter(i => i.isActive).length,
    inactive: scheduledInvoices.filter(i => !i.isActive).length,
    totalAmount: scheduledInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading scheduled invoices...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Scheduled Invoices</h1>
          <p className="text-gray-600">Manage recurring invoices for clients</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Scheduled</CardTitle>
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
              <CardTitle className="text-sm font-medium text-red-600">Inactive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inactive}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Total Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalAmount.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search scheduled invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Create Scheduled Invoice
          </Button>
        </div>

        {/* Scheduled Invoices List */}
        <div className="space-y-4">
          {filteredInvoices.map((invoice) => (
            <Card key={invoice.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{invoice.title}</h3>
                      <Badge className={getStatusBadge(invoice.isActive)}>
                        {invoice.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge className={getFrequencyBadge(invoice.frequency)}>
                        {invoice.frequency}
                      </Badge>
                    </div>
                    
                    <p className="text-gray-600 mb-3">{invoice.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <p><strong>Client:</strong> {invoice.clientName}</p>
                        <p><strong>Amount:</strong> ${invoice.amount.toFixed(2)}</p>
                        <p><strong>Frequency:</strong> {invoice.frequency}</p>
                        {invoice.frequency === 'weekly' && invoice.dayOfWeek !== null && invoice.dayOfWeek !== undefined && (
                          <p><strong>Day:</strong> {getDayOfWeekName(invoice.dayOfWeek)}</p>
                        )}
                        {['monthly', 'quarterly', 'yearly'].includes(invoice.frequency) && invoice.dayOfMonth && (
                          <p><strong>Day of Month:</strong> {invoice.dayOfMonth}</p>
                        )}
                      </div>
                      <div>
                        <p><strong>Time:</strong> {invoice.time} ({invoice.timezone})</p>
                        <p><strong>Created:</strong> {new Date(invoice.createdAt).toLocaleDateString()}</p>
                        {invoice.lastExecuted && (
                          <p><strong>Last Executed:</strong> {new Date(invoice.lastExecuted).toLocaleDateString()}</p>
                        )}
                        {invoice.nextExecution && (
                          <p><strong>Next Execution:</strong> {new Date(invoice.nextExecution).toLocaleDateString()}</p>
                        )}
                      </div>
                    </div>

                    {invoice.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-600">
                          <strong>Notes:</strong> {invoice.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openViewModal(invoice)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditModal(invoice)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openSendEmailModal(invoice)}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Mail className="h-4 w-4 mr-1" />
                      Send Email
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleActive(invoice.id, invoice.isActive)}
                      className={invoice.isActive ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                    >
                      {invoice.isActive ? (
                        <>
                          <XCircle className="h-4 w-4 mr-1" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Activate
                        </>
                      )}
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteScheduledInvoice(invoice.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredInvoices.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <div className="text-gray-500 mb-4">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No scheduled invoices found</h3>
                <p className="text-sm">Create your first scheduled invoice to get started</p>
              </div>
              <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Create Scheduled Invoice
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create Scheduled Invoice Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create Scheduled Invoice"
        >
          <form onSubmit={handleCreateScheduledInvoice} className="space-y-4">
            <div>
              <Label htmlFor="clientId">Client *</Label>
              <Select value={formData.clientId} onValueChange={(value) => handleInputChange('clientId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName || client.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="title">Invoice Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Monthly Maintenance Fee"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Description of the recurring service"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="200.00"
                required
              />
            </div>

            <div>
              <Label htmlFor="frequency">Frequency *</Label>
              <Select value={formData.frequency} onValueChange={(value) => handleInputChange('frequency', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.frequency === 'weekly' && (
              <div>
                <Label htmlFor="dayOfWeek">Day of Week *</Label>
                <Select value={formData.dayOfWeek} onValueChange={(value) => handleInputChange('dayOfWeek', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {['monthly', 'quarterly', 'yearly'].includes(formData.frequency) && (
              <div>
                <Label htmlFor="dayOfMonth">Day of Month *</Label>
                <Select value={formData.dayOfMonth} onValueChange={(value) => handleInputChange('dayOfMonth', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="time">Time *</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => handleInputChange('time', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="timezone">Timezone *</Label>
              <Select value={formData.timezone} onValueChange={(value) => handleInputChange('timezone', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes or instructions"
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
                Create Scheduled Invoice
              </Button>
            </div>
          </form>
        </Modal>

        {/* View Details Modal */}
        <Modal
          isOpen={showViewModal}
          onClose={() => {
            setShowViewModal(false)
            setSelectedInvoice(null)
          }}
          title="Scheduled Invoice Details"
        >
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Title</Label>
                  <div className="text-sm text-gray-900">{selectedInvoice.title}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusBadge(selectedInvoice.isActive)}>
                      {selectedInvoice.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Client</Label>
                  <div className="text-sm text-gray-900">{selectedInvoice.clientName}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Amount</Label>
                  <div className="text-sm text-gray-900">${selectedInvoice.amount.toFixed(2)}</div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Description</Label>
                <div className="text-sm text-gray-900">{selectedInvoice.description || 'N/A'}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Frequency</Label>
                  <div className="text-sm text-gray-900 capitalize">
                    <Badge className={getFrequencyBadge(selectedInvoice.frequency)}>
                      {selectedInvoice.frequency}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Time</Label>
                  <div className="text-sm text-gray-900">{selectedInvoice.time} ({selectedInvoice.timezone})</div>
                </div>
              </div>

              {selectedInvoice.frequency === 'weekly' && selectedInvoice.dayOfWeek != null && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Day of Week</Label>
                  <div className="text-sm text-gray-900">{getDayOfWeekName(selectedInvoice.dayOfWeek)}</div>
                </div>
              )}

              {['monthly', 'quarterly', 'yearly'].includes(selectedInvoice.frequency) && selectedInvoice.dayOfMonth && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Day of Month</Label>
                  <div className="text-sm text-gray-900">{selectedInvoice.dayOfMonth}</div>
                </div>
              )}

              {selectedInvoice.nextExecution && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Next Execution</Label>
                  <div className="text-sm text-gray-900">
                    {new Date(selectedInvoice.nextExecution).toLocaleDateString()} at {selectedInvoice.time}
                  </div>
                </div>
              )}

              {selectedInvoice.lastExecuted && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Last Executed</Label>
                  <div className="text-sm text-gray-900">{new Date(selectedInvoice.lastExecuted).toLocaleDateString()}</div>
                </div>
              )}

              {selectedInvoice.notes && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Notes</Label>
                  <div className="text-sm text-gray-900">{selectedInvoice.notes}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <strong>Created:</strong> {new Date(selectedInvoice.createdAt).toLocaleDateString()}
                </div>
                <div>
                  <strong>Updated:</strong> {new Date(selectedInvoice.updatedAt).toLocaleDateString()}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowViewModal(false)
                    setSelectedInvoice(null)
                  }}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowViewModal(false)
                    openEditModal(selectedInvoice)
                  }}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Edit Scheduled Invoice Modal */}
        <Modal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setSelectedInvoice(null)
            resetForm()
          }}
          title="Edit Scheduled Invoice"
        >
          <form onSubmit={handleEditScheduledInvoice} className="space-y-4">
            <div>
              <Label htmlFor="edit-clientId">Client *</Label>
              <Select value={formData.clientId} onValueChange={(value) => handleInputChange('clientId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.fullName} ({client.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-title">Title *</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Monthly Service Invoice"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Description of the scheduled invoice"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="edit-amount">Amount *</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-frequency">Frequency *</Label>
              <Select value={formData.frequency} onValueChange={(value) => handleInputChange('frequency', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.frequency === 'weekly' && (
              <div>
                <Label htmlFor="edit-dayOfWeek">Day of Week *</Label>
                <Select value={formData.dayOfWeek} onValueChange={(value) => handleInputChange('dayOfWeek', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {['monthly', 'quarterly', 'yearly'].includes(formData.frequency) && (
              <div>
                <Label htmlFor="edit-dayOfMonth">Day of Month *</Label>
                <Select value={formData.dayOfMonth} onValueChange={(value) => handleInputChange('dayOfMonth', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-time">Time *</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={formData.time}
                  onChange={(e) => handleInputChange('time', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-timezone">Timezone *</Label>
                <Select value={formData.timezone} onValueChange={(value) => handleInputChange('timezone', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes"
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditModal(false)
                  setSelectedInvoice(null)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                Update Scheduled Invoice
              </Button>
            </div>
          </form>
        </Modal>

        {/* Send Email Confirmation Modal */}
        <Modal
          isOpen={showSendEmailModal}
          onClose={() => {
            if (!sendingEmail) {
              setShowSendEmailModal(false)
              setSelectedInvoice(null)
            }
          }}
          title="Send Invoice Email"
        >
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start">
                  <Mail className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                  <div>
                    <p className="text-sm text-gray-700 mb-3">
                      Are you sure you want to send an invoice email for this scheduled invoice?
                    </p>
                    <div className="space-y-2 text-sm">
                      <p><strong>Title:</strong> {selectedInvoice.title}</p>
                      <p><strong>Client:</strong> {selectedInvoice.clientName}</p>
                      <p><strong>Email:</strong> {selectedInvoice.clientEmail}</p>
                      <p><strong>Amount:</strong> ${selectedInvoice.amount.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> This will send a preview invoice email to the client immediately. No invoice will be created in the system.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowSendEmailModal(false)
                    setSelectedInvoice(null)
                  }}
                  disabled={sendingEmail}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmSendEmail}
                  disabled={sendingEmail}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {sendingEmail ? (
                    <>
                      <span className="inline-block animate-spin mr-2">⏳</span>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  )
}