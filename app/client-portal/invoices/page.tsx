'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/modal'
import { useAuth } from '@/lib/auth'
import { Invoice } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Search, 
  Receipt, 
  DollarSign,
  MapPin,
  Calendar,
  Download,
  Eye,
  FileText
} from 'lucide-react'

export default function ClientInvoicesPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)

  useEffect(() => {
    fetchInvoices()
  }, [])

  const fetchInvoices = async () => {
    try {
      const response = await fetch(`/api/client/invoices?clientId=${profile?.id}`)
      if (response.ok) {
        const data = await response.json()
        setInvoices(data)
      } else {
        error('Fetch Error', 'Failed to load invoices')
      }
    } catch (err) {
      error('Fetch Error', 'Error loading invoices')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/download`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `invoice-${invoiceId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        success('Download Started', 'Invoice PDF download started')
      } else {
        error('Download Failed', 'Failed to download invoice PDF')
      }
    } catch (err) {
      error('Download Failed', 'Error downloading invoice PDF')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <Receipt className="h-4 w-4" />
      case 'overdue': return <Calendar className="h-4 w-4" />
      case 'sent': return <FileText className="h-4 w-4" />
      case 'cancelled': return <FileText className="h-4 w-4" />
      default: return <Receipt className="h-4 w-4" />
    }
  }

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.workOrderTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.subcontractorName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: invoices.length,
    pending: invoices.filter(i => ['sent'].includes(i.status)).length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    totalAmount: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Invoices Management</h1>
          <p className="text-gray-600">View and manage your invoices</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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
              <CardTitle className="text-sm font-medium text-blue-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
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
              <CardTitle className="text-sm font-medium text-gray-600">Total Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalAmount.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="sent">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Invoices List */}
        <div className="space-y-4">
          {filteredInvoices.map((invoice) => (
            <Card key={invoice.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{invoice.workOrderTitle}</h3>
                      <Badge className={getStatusBadge(invoice.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(invoice.status)}
                          {invoice.status}
                        </span>
                      </Badge>
                    </div>
                    
                    <p className="text-gray-600 mb-3">{invoice.workOrderDescription}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="h-4 w-4" />
                          <span><strong>Location:</strong> {invoice.workOrderLocation.name}</span>
                        </div>
                        <p><strong>Address:</strong> {invoice.workOrderLocation.address}</p>
                        <p><strong>Invoice #:</strong> {invoice.invoiceNumber}</p>
                        {invoice.subcontractorName && (
                          <p><strong>Subcontractor:</strong> {invoice.subcontractorName}</p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="h-4 w-4" />
                          <span><strong>Total Amount:</strong> ${invoice.totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span><strong>Due Date:</strong> {new Date(invoice.dueDate).toLocaleDateString()}</span>
                        </div>
                        <p><strong>Created:</strong> {new Date(invoice.createdAt).toLocaleDateString()}</p>
                        {invoice.paidAt && (
                          <p><strong>Paid:</strong> {new Date(invoice.paidAt).toLocaleDateString()}</p>
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

                    {invoice.paymentMethod && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                        <p className="text-sm text-green-700">
                          <strong>Payment Method:</strong> {invoice.paymentMethod}
                          {invoice.paymentReference && (
                            <span> • <strong>Reference:</strong> {invoice.paymentReference}</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedInvoice(invoice)
                        setShowInvoiceModal(true)
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    
                    {invoice.pdfUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadInvoice(invoice.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download PDF
                      </Button>
                    )}
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
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No invoices found</h3>
                <p className="text-sm">Invoices will appear here when created by admin</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoice Details Modal */}
        {selectedInvoice && (
          <Modal
            isOpen={showInvoiceModal}
            onClose={() => setShowInvoiceModal(false)}
            title={`Invoice Details - ${selectedInvoice.invoiceNumber}`}
          >
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Work Order Information</h4>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Title:</strong> {selectedInvoice.workOrderTitle}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Description:</strong> {selectedInvoice.workOrderDescription}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Location:</strong> {selectedInvoice.workOrderLocation.name}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Address:</strong> {selectedInvoice.workOrderLocation.address}
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Invoice Details</h4>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Invoice Number:</strong> {selectedInvoice.invoiceNumber}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Total Amount:</strong> ${selectedInvoice.totalAmount.toFixed(2)}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Due Date:</strong> {new Date(selectedInvoice.dueDate).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Status:</strong> 
                  <Badge className={`ml-2 ${getStatusBadge(selectedInvoice.status)}`}>
                    {selectedInvoice.status}
                  </Badge>
                </p>
                {selectedInvoice.subcontractorName && (
                  <p className="text-sm text-gray-600 mb-1">
                    <strong>Subcontractor:</strong> {selectedInvoice.subcontractorName}
                  </p>
                )}
              </div>

              {/* Line Items */}
              {selectedInvoice.lineItems && selectedInvoice.lineItems.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Line Items</h4>
                  <div className="space-y-2">
                    {selectedInvoice.lineItems.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div>
                          <p className="text-sm font-medium">{item.description}</p>
                          <p className="text-xs text-gray-600">
                            {item.quantity} x ${item.unitPrice.toFixed(2)} ({item.category})
                          </p>
                        </div>
                        <p className="text-sm font-medium">${item.totalPrice.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedInvoice.notes && (
                <div>
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm text-gray-600">{selectedInvoice.notes}</p>
                </div>
              )}

              {selectedInvoice.paymentMethod && (
                <div>
                  <h4 className="font-semibold mb-2">Payment Information</h4>
                  <p className="text-sm text-green-700 bg-green-50 p-2 rounded">
                    <strong>Method:</strong> {selectedInvoice.paymentMethod}
                    {selectedInvoice.paymentReference && (
                      <span><br /><strong>Reference:</strong> {selectedInvoice.paymentReference}</span>
                    )}
                    <br /><strong>Paid Date:</strong> {new Date(selectedInvoice.paidAt!).toLocaleDateString()}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button onClick={() => setShowInvoiceModal(false)}>Close</Button>
                {selectedInvoice.pdfUrl && (
                  <Button onClick={() => handleDownloadInvoice(selectedInvoice.id)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        )}
      </div>
    </>
  )
}
