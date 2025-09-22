'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Loader from '@/components/ui/loader'
import { FileText, CheckCircle, XCircle, Clock, DollarSign, Calendar, MapPin } from 'lucide-react'
import { Quote } from '@/lib/types'

export default function ClientQuotesPage() {
  const { user, profile } = useAuth()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (user && profile) {
      fetchQuotes()
    }
  }, [user, profile])

  const fetchQuotes = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/client/quotes?clientId=${user?.uid}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error fetching quotes:', errorText)
        setError('Failed to fetch quotes')
        return
      }

      const data = await response.json()
      console.log('Quotes fetched:', data)
      
      // Sort quotes by createdAt manually since we can't use orderBy in the query
      const sortedQuotes = (data.quotes || []).sort((a: Quote, b: Quote) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return dateB - dateA // Descending order (newest first)
      })
      
      setQuotes(sortedQuotes)
    } catch (error) {
      console.error('Error fetching quotes:', error)
      setError('Failed to fetch quotes')
    } finally {
      setLoading(false)
    }
  }

  const handleQuoteAction = async (quoteId: string, action: 'approve' | 'reject') => {
    try {
      setActionLoading(quoteId)
      const response = await fetch(`/api/client/quotes/${quoteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: action === 'approve' ? 'accepted' : 'rejected',
          clientId: user?.uid 
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error updating quote:', errorText)
        alert('Failed to update quote')
        return
      }

      const data = await response.json()
      console.log('Quote updated:', data)
      
      // Refresh quotes list
      await fetchQuotes()
      alert(`Quote ${action}d successfully!`)
    } catch (error) {
      console.error('Error updating quote:', error)
      alert('Failed to update quote')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      case 'sent':
        return 'bg-blue-100 text-blue-800'
      case 'accepted':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return <Loader fullScreen text="Loading quotes..." />
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchQuotes}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Quotes</h1>
        <p className="text-gray-600">Review and manage your quotes from Spruce App</p>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No quotes found</h3>
              <p className="text-gray-600">You don't have any quotes yet. Quotes will appear here once they're created by the admin.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {quotes.map((quote) => (
            <Card key={quote.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Quote #{quote.id?.substring(0, 8)}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {quote.workOrderTitle}
                    </CardDescription>
                  </div>
                  <Badge className={`${getStatusBadge(quote.status)} text-sm`}>
                    {quote.status.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Total Amount</p>
                      <p className="font-semibold">{formatCurrency(quote.totalAmount)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Valid Until</p>
                      <p className="font-semibold">{formatDate(quote.validUntil)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Location</p>
                      <p className="font-semibold">{quote.workOrderLocation?.name || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-2">Description</h4>
                  <p className="text-gray-600">{quote.workOrderDescription}</p>
                </div>

                {quote.notes && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Notes</h4>
                    <p className="text-gray-600">{quote.notes}</p>
                  </div>
                )}

                {quote.terms && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Terms & Conditions</h4>
                    <p className="text-gray-600">{quote.terms}</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  {quote.status === 'sent' && (
                    <>
                      <Button
                        onClick={() => handleQuoteAction(quote.id!, 'approve')}
                        disabled={actionLoading === quote.id}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {actionLoading === quote.id ? (
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Approve Quote
                      </Button>
                      
                      <Button
                        onClick={() => handleQuoteAction(quote.id!, 'reject')}
                        disabled={actionLoading === quote.id}
                        variant="destructive"
                      >
                        {actionLoading === quote.id ? (
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-2" />
                        )}
                        Reject Quote
                      </Button>
                    </>
                  )}
                  
                  {quote.status === 'accepted' && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Quote Accepted</span>
                    </div>
                  )}
                  
                  {quote.status === 'rejected' && (
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span className="font-medium">Quote Rejected</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
