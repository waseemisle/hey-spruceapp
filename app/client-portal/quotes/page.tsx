'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/modal'
import { useAuth } from '@/lib/auth'
import { Quote } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Search, 
  FileText, 
  DollarSign,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Eye
} from 'lucide-react'

export default function ClientQuotesPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [showQuoteModal, setShowQuoteModal] = useState(false)

  useEffect(() => {
    fetchQuotes()
  }, [])

  const fetchQuotes = async () => {
    try {
      const response = await fetch(`/api/client/quotes?clientId=${profile?.id}`)
      if (response.ok) {
        const data = await response.json()
        setQuotes(data)
      } else {
        error('Fetch Error', 'Failed to load quotes')
      }
    } catch (err) {
      error('Fetch Error', 'Error loading quotes')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptQuote = async (quoteId: string) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: profile?.id,
          clientName: profile?.fullName
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept quote')
      }

      success('Quote Accepted', 'Quote has been accepted successfully!')
      fetchQuotes()
    } catch (err: any) {
      error('Acceptance Failed', err.message)
    }
  }

  const handleRejectQuote = async (quoteId: string) => {
    const reason = prompt('Please provide a reason for rejection:')
    if (!reason) return

    try {
      const response = await fetch(`/api/quotes/${quoteId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: profile?.id,
          clientName: profile?.fullName,
          reason
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject quote')
      }

      success('Quote Rejected', 'Quote has been rejected successfully!')
      fetchQuotes()
    } catch (err: any) {
      error('Rejection Failed', err.message)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800',
      shared_with_client: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      edited_by_admin: 'bg-orange-100 text-orange-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return <CheckCircle className="h-4 w-4" />
      case 'rejected': return <XCircle className="h-4 w-4" />
      case 'shared_with_client': return <FileText className="h-4 w-4" />
      case 'edited_by_admin': return <FileText className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = quote.workOrderTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.workOrderDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.subcontractorName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: quotes.length,
    pending: quotes.filter(q => q.status === 'shared_with_client').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    rejected: quotes.filter(q => q.status === 'rejected').length
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Quotes Management</h1>
          <p className="text-gray-600">Review and manage quotes for your work orders</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Accepted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.accepted}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rejected}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search quotes..."
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
            <option value="shared_with_client">Pending Review</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="edited_by_admin">Edited by Admin</option>
          </select>
        </div>

        {/* Quotes List */}
        <div className="space-y-4">
          {filteredQuotes.map((quote) => (
            <Card key={quote.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{quote.workOrderTitle}</h3>
                      <Badge className={getStatusBadge(quote.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(quote.status)}
                          {quote.status.replace(/_/g, ' ')}
                        </span>
                      </Badge>
                    </div>
                    
                    <p className="text-gray-600 mb-3">{quote.workOrderDescription}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="h-4 w-4" />
                          <span><strong>Location:</strong> {quote.workOrderLocation.name}</span>
                        </div>
                        <p><strong>Address:</strong> {quote.workOrderLocation.address}</p>
                        <p><strong>Subcontractor:</strong> {quote.subcontractorName}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="h-4 w-4" />
                          <span><strong>Total Amount:</strong> ${quote.clientAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span><strong>Valid Until:</strong> {new Date(quote.validUntil).toLocaleDateString()}</span>
                        </div>
                        <p><strong>Created:</strong> {new Date(quote.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {quote.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-600">
                          <strong>Notes:</strong> {quote.notes}
                        </p>
                      </div>
                    )}

                    {quote.adminNotes && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                        <p className="text-sm text-blue-700">
                          <strong>Admin Notes:</strong> {quote.adminNotes}
                        </p>
                      </div>
                    )}

                    {quote.rejectionReason && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                        <p className="text-sm text-red-700">
                          <strong>Rejection Reason:</strong> {quote.rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedQuote(quote)
                        setShowQuoteModal(true)
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    
                    {quote.status === 'shared_with_client' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleAcceptQuote(quote.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Accept Quote
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectQuote(quote.id)}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject Quote
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredQuotes.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <div className="text-gray-500 mb-4">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No quotes found</h3>
                <p className="text-sm">Quotes will appear here when shared by admin</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quote Details Modal */}
        {selectedQuote && (
          <Modal
            isOpen={showQuoteModal}
            onClose={() => setShowQuoteModal(false)}
            title={`Quote Details - ${selectedQuote.workOrderTitle}`}
          >
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Work Order Information</h4>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Title:</strong> {selectedQuote.workOrderTitle}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Description:</strong> {selectedQuote.workOrderDescription}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Location:</strong> {selectedQuote.workOrderLocation.name}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Address:</strong> {selectedQuote.workOrderLocation.address}
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Quote Details</h4>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Subcontractor:</strong> {selectedQuote.subcontractorName}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Total Amount:</strong> ${selectedQuote.clientAmount.toFixed(2)}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Valid Until:</strong> {new Date(selectedQuote.validUntil).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Status:</strong> 
                  <Badge className={`ml-2 ${getStatusBadge(selectedQuote.status)}`}>
                    {selectedQuote.status.replace(/_/g, ' ')}
                  </Badge>
                </p>
              </div>

              {selectedQuote.notes && (
                <div>
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm text-gray-600">{selectedQuote.notes}</p>
                </div>
              )}

              {selectedQuote.adminNotes && (
                <div>
                  <h4 className="font-semibold mb-2">Admin Notes</h4>
                  <p className="text-sm text-blue-700 bg-blue-50 p-2 rounded">{selectedQuote.adminNotes}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setShowQuoteModal(false)}>Close</Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </>
  )
}