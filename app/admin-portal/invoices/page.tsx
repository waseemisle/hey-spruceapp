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
import { Invoice, Quote } from '@/lib/types'
import WithRoleProtection from '@/components/auth/withRoleProtection'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import CreateInvoiceModal from '@/components/modals/CreateInvoiceModal'
import { 
  Search, 
  Eye, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock,
  DollarSign,
  FileText,
  Calendar,
  User,
  MapPin,
  Plus,
  Receipt
} from 'lucide-react'

export default function AdminInvoicesPage() {
  return (
    <WithRoleProtection 
      allowedRoles={['admin']}
      fallbackMessage="This invoices page is only accessible to administrators."
    >
      <AdminInvoicesContent />
    </WithRoleProtection>
  )
}

function AdminInvoicesContent() {
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error, info } = useNotifications()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    // Fetch invoices
    const invoicesQuery = db.collection('invoices').orderBy('createdAt', 'desc')
    const unsubscribeInvoices = invoicesQuery.onSnapshot((snapshot) => {
      const invoicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[]
      setInvoices(invoicesData)
      setIsLoading(false)
    })

    // Fetch approved quotes for creating invoices
    const quotesQuery = db.collection('quotes').orderBy('createdAt', 'desc')
    const unsubscribeQuotes = quotesQuery.onSnapshot((snapshot) => {
      const quotesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Quote[]
      // Filter only accepted quotes
      const acceptedQuotes = quotesData.filter(quote => quote.status === 'accepted')
      setQuotes(acceptedQuotes)
    })

    return () => {
      unsubscribeInvoices()
      unsubscribeQuotes()
    }
  }, [])

  const handleCreateInvoice = async (invoiceData: any) => {
    try {
      console.log('Creating invoice with data:', {
        ...invoiceData,
        adminId: user?.uid,
        adminName: profile?.fullName,
        adminEmail: profile?.email
      })

      const response = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...invoiceData,
          adminId: user?.uid,
          adminName: profile?.fullName,
          adminEmail: profile?.email
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Invoice created successfully:', result)
        success('Invoice Created', 'Invoice created successfully!')
        setShowCreateModal(false)
      } else {
        let errorMessage = 'Failed to create invoice'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.details || errorMessage
          console.error('Server error response:', errorData)
        } catch (jsonError) {
          console.error('Failed to parse error response as JSON:', jsonError)
          const textResponse = await response.text()
          console.error('Raw error response:', textResponse)
          errorMessage = `Server error (${response.status}): ${textResponse || 'Unknown error'}`
        }
        error('Invoice Creation Failed', errorMessage)
      }
    } catch (err) {
      console.error('Error creating invoice:', err)
      error('Error', `Failed to create invoice: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleStatusUpdate = async (invoiceId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          adminId: user?.uid
        })
      })

      if (response.ok) {
        success('Invoice Updated', `Invoice status updated to ${newStatus}`)
      } else {
        const errorData = await response.json()
        error('Update Failed', errorData.error || 'Failed to update invoice status')
      }
    } catch (err) {
      console.error('Error updating invoice status:', err)
      error('Error', 'Failed to update invoice status')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <FileText className="h-4 w-4" />
      case 'sent':
        return <Send className="h-4 w-4" />
      case 'paid':
        return <CheckCircle className="h-4 w-4" />
      case 'overdue':
        return <Clock className="h-4 w-4" />
      case 'cancelled':
        return <XCircle className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = 
      (invoice.workOrderTitle?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (invoice.clientName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (invoice.workOrderLocation?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    totalValue: invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0),
    paidValue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.totalAmount || 0), 0)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading invoices...</p>
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
          <h1 className="text-3xl font-bold">Invoice Management</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.draft}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sent}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.paid}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.overdue}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Value</CardTitle>
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
                    placeholder="Search invoices..."
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
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoices List */}
        <div className="space-y-4">
          {filteredInvoices.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
                <p className="text-gray-600">
                  {searchTerm || filterStatus !== 'all' 
                    ? 'Try adjusting your search or filter criteria.' 
                    : 'No invoices have been created yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredInvoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardHeader>
                  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                    <div className="flex-1">
                      <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                        <span className="text-lg font-semibold break-words">{invoice.workOrderTitle || 'Untitled Invoice'}</span>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={`${getStatusBadge(invoice.status)} text-xs flex items-center gap-1`}>
                            {getStatusIcon(invoice.status)}
                            {invoice.status || 'unknown'}
                          </Badge>
                        </div>
                      </CardTitle>
                      <p className="text-sm text-gray-600 line-clamp-2">{invoice.workOrderDescription || 'No description available'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invoice.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(invoice.id, 'sent')}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Send
                        </Button>
                      )}
                      {invoice.status === 'sent' && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(invoice.id, 'paid')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Mark Paid
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{invoice.clientName || 'Unknown Client'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{invoice.workOrderLocation?.name || 'Unknown Location'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>${(invoice.totalAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'No date'}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-gray-600 space-y-1">
                    <p><strong>Invoice ID:</strong> {invoice.id}</p>
                    <p><strong>Created:</strong> {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : 'Unknown'}</p>
                    {invoice.sentAt && (
                      <p><strong>Sent:</strong> {new Date(invoice.sentAt).toLocaleDateString()}</p>
                    )}
                    {invoice.paidAt && (
                      <p><strong>Paid:</strong> {new Date(invoice.paidAt).toLocaleDateString()}</p>
                    )}
                    {invoice.subcontractorName && (
                      <p><strong>Subcontractor:</strong> {invoice.subcontractorName}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Create Invoice Modal */}
        <CreateInvoiceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateInvoice}
          isSubmitting={false}
          quotes={quotes}
        />
      </div>
    </>
  )
}
