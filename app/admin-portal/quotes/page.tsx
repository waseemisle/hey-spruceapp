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
import { Quote } from '@/lib/types'
import WithRoleProtection from '@/components/auth/withRoleProtection'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Search, 
  Eye, 
  Edit, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock,
  DollarSign,
  FileText,
  Calendar,
  User,
  MapPin
} from 'lucide-react'

export default function AdminQuotesPage() {
  return (
    <WithRoleProtection 
      allowedRoles={['admin']}
      fallbackMessage="This quotes page is only accessible to administrators."
    >
      <AdminQuotesContent />
    </WithRoleProtection>
  )
}

function AdminQuotesContent() {
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error, info } = useNotifications()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterWorkOrder, setFilterWorkOrder] = useState('all')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Fetch quotes
    const quotesQuery = db.collection('quotes').orderBy('createdAt', 'desc')
    const unsubscribe = quotesQuery.onSnapshot((snapshot) => {
      const quotesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Quote[]
      setQuotes(quotesData)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const handleSendQuote = async (quoteId: string) => {
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: user?.uid
        })
      })

      if (response.ok) {
        success('Quote Sent', 'Quote sent to client via email successfully!')
      } else {
        const errorData = await response.json()
        error('Send Failed', errorData.error || 'Failed to send quote')
      }
    } catch (err) {
      console.error('Error sending quote:', err)
      error('Error', 'Failed to send quote')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      expired: 'bg-orange-100 text-orange-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <FileText className="h-4 w-4" />
      case 'sent':
        return <Send className="h-4 w-4" />
      case 'accepted':
        return <CheckCircle className="h-4 w-4" />
      case 'rejected':
        return <XCircle className="h-4 w-4" />
      case 'expired':
        return <Clock className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = 
      (quote.workOrderTitle?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (quote.clientName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (quote.workOrderLocation?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || quote.status === filterStatus
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: quotes.length,
    pending: quotes.filter(q => q.status === 'pending').length,
    shared: quotes.filter(q => q.status === 'shared_with_client').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    rejected: quotes.filter(q => q.status === 'rejected').length,
    totalValue: quotes.reduce((sum, q) => sum + (q.clientAmount || 0), 0)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading quotes...</p>
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
          <h1 className="text-3xl font-bold">Quotes Management</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              <CardTitle className="text-sm font-medium text-gray-600">Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.shared}</div>
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
                    placeholder="Search quotes..."
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
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quotes List */}
        <div className="space-y-4">
          {filteredQuotes.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No quotes found</h3>
                <p className="text-gray-600">
                  {searchTerm || filterStatus !== 'all' 
                    ? 'Try adjusting your search or filter criteria.' 
                    : 'No quotes have been created yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredQuotes.map((quote) => (
              <Card key={quote.id}>
                <CardHeader>
                  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                    <div className="flex-1">
                      <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                        <span className="text-lg font-semibold break-words">{quote.workOrderTitle || 'Untitled Quote'}</span>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={`${getStatusBadge(quote.status)} text-xs flex items-center gap-1`}>
                            {getStatusIcon(quote.status)}
                            {quote.status || 'unknown'}
                          </Badge>
                        </div>
                      </CardTitle>
                      <p className="text-sm text-gray-600 line-clamp-2">{quote.workOrderDescription || 'No description available'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {quote.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => handleSendQuote(quote.id)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Send Quote
                        </Button>
                      )}
                      {quote.status === 'shared_with_client' && (
                        <div className="text-sm text-gray-600">
                          <p>Waiting for client approval...</p>
                        </div>
                      )}
                      {quote.status === 'accepted' && (
                        <div className="text-sm text-green-600">
                          <p>✓ Quote approved by client</p>
                        </div>
                      )}
                      {quote.status === 'rejected' && (
                        <div className="text-sm text-red-600">
                          <p>✗ Quote rejected by client</p>
                        </div>
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
                      <span className="truncate">{quote.clientName || 'Unknown Client'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{quote.workOrderLocation?.name || 'Unknown Location'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
                       <span>${(quote.clientAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'No date'}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-gray-600 space-y-1">
                    <p><strong>Quote ID:</strong> {quote.id}</p>
                    <p><strong>Created:</strong> {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'Unknown'}</p>
                    {quote.sentAt && (
                      <p><strong>Sent:</strong> {new Date(quote.sentAt).toLocaleDateString()}</p>
                    )}
                    {quote.acceptedAt && (
                      <p><strong>Accepted:</strong> {new Date(quote.acceptedAt).toLocaleDateString()}</p>
                    )}
                    {quote.rejectedAt && (
                      <p><strong>Rejected:</strong> {new Date(quote.rejectedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  )
}
