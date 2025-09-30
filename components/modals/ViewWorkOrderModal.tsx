'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/modal'
import { WorkOrder, Quote } from '@/lib/types'
import { 
  MapPin, 
  Calendar, 
  DollarSign, 
  Clock, 
  User, 
  Mail, 
  Building2,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  X,
  Eye
} from 'lucide-react'

interface ViewWorkOrderModalProps {
  isOpen: boolean
  onClose: () => void
  workOrder?: WorkOrder | null
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4" />
    case 'approved':
      return <CheckCircle className="h-4 w-4" />
    case 'rejected':
      return <XCircle className="h-4 w-4" />
    case 'in-progress':
      return <Clock className="h-4 w-4" />
    case 'completed':
      return <CheckCircle className="h-4 w-4" />
    case 'cancelled':
      return <X className="h-4 w-4" />
    default:
      return <AlertCircle className="h-4 w-4" />
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'approved':
      return 'bg-green-100 text-green-800'
    case 'rejected':
      return 'bg-red-100 text-red-800'
    case 'in-progress':
      return 'bg-blue-100 text-blue-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'cancelled':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'low':
      return 'bg-green-100 text-green-800'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800'
    case 'high':
      return 'bg-orange-100 text-orange-800'
    case 'urgent':
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
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export default function ViewWorkOrderModal({ 
  isOpen, 
  onClose, 
  workOrder 
}: ViewWorkOrderModalProps) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loadingQuotes, setLoadingQuotes] = useState(false)

  useEffect(() => {
    if (isOpen && workOrder) {
      fetchQuotes()
    }
  }, [isOpen, workOrder])

  const fetchQuotes = async () => {
    if (!workOrder) return
    
    setLoadingQuotes(true)
    try {
      console.log('Fetching quotes for work order:', workOrder.id)
      const response = await fetch(`/api/admin/quotes?workOrderId=${workOrder.id}`)
      
      if (!response.ok) {
        console.error('Response not ok:', response.status, response.statusText)
        const errorText = await response.text()
        console.error('Error response:', errorText)
        return
      }
      
      const data = await response.json()
      console.log('Quotes response:', data)
      
      if (data.success) {
        setQuotes(data.quotes || [])
      } else {
        console.error('API returned error:', data.error)
      }
    } catch (error) {
      console.error('Error fetching quotes:', error)
    } finally {
      setLoadingQuotes(false)
    }
  }

  const getQuoteStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800'
      case 'sent': return 'bg-blue-100 text-blue-800'
      case 'accepted': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      case 'expired': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (!workOrder) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Work Order Details" maxWidth="max-w-4xl">
      <div className="space-y-4 sm:space-y-6">
        {/* Header Information */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{workOrder.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge className={`${getStatusColor(workOrder.status)} text-xs sm:text-sm`}>
                {getStatusIcon(workOrder.status)}
                <span className="ml-1 capitalize">{workOrder.status.replace('-', ' ')}</span>
              </Badge>
              <Badge className={`${getPriorityColor(workOrder.priority)} text-xs sm:text-sm`}>
                {workOrder.priority} Priority
              </Badge>
            </div>
          </div>
        </div>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 whitespace-pre-wrap">{workOrder.description}</p>
          </CardContent>
        </Card>

        {/* Location Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-500" />
                <span className="font-medium">{workOrder.location?.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">{workOrder.location?.address}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Work Order Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Work Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="font-medium text-gray-600 text-sm sm:text-base">Category:</span>
                <Badge variant="outline" className="capitalize w-fit">
                  {workOrder.categoryName}
                </Badge>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-600 text-sm sm:text-base">Estimated Cost:</span>
                </div>
                <span className="text-sm sm:text-base">{workOrder.estimatedCost ? formatCurrency(workOrder.estimatedCost) : 'Not specified'}</span>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-600 text-sm sm:text-base">Estimated Duration:</span>
                </div>
                <span className="text-sm sm:text-base">{workOrder.estimatedCost ? `$${workOrder.estimatedCost}` : 'Not specified'}</span>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-600 text-sm sm:text-base">Scheduled Date:</span>
                </div>
                <span className="text-sm sm:text-base">{formatDate(workOrder.scheduledDate || '')}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-600 text-sm sm:text-base">Client:</span>
                </div>
                <span className="text-sm sm:text-base break-words">{workOrder.clientName}</span>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-600 text-sm sm:text-base">Email:</span>
                </div>
                <span className="text-sm sm:text-base break-all">{workOrder.clientEmail}</span>
              </div>
              
              {workOrder.assignedToName && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <span className="font-medium text-gray-600 text-sm sm:text-base">Assigned To:</span>
                  </div>
                  <span className="text-sm sm:text-base break-words">{workOrder.assignedToName}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quotes Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Quotes ({quotes.length})
            </CardTitle>
            <CardDescription>
              Quotes created for this work order
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingQuotes ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading quotes...</p>
              </div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No quotes created yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {quotes.map((quote) => (
                  <div key={quote.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold">Quote #{quote.id.slice(-8)}</h4>
                          <Badge className={getQuoteStatusColor(quote.status)}>
                            {quote.status}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                          <div>
                            <p><strong>Total Amount:</strong> {formatCurrency(quote.clientAmount)}</p>
                            <p><strong>Valid Until:</strong> {formatDate(quote.validUntil)}</p>
                          </div>
                          <div>
                            <p><strong>Labor Cost:</strong> {formatCurrency(quote.laborCost)}</p>
                            <p><strong>Material Cost:</strong> {formatCurrency(quote.materialCost)}</p>
                          </div>
                          <div>
                            <p><strong>Tax Rate:</strong> {quote.taxRate}%</p>
                            <p><strong>Created:</strong> {formatDate(quote.createdAt)}</p>
                          </div>
                        </div>

                        {quote.lineItems.length > 0 && (
                          <div className="mt-3">
                            <p className="font-medium text-sm mb-2">Line Items:</p>
                            <div className="space-y-1">
                              {quote.lineItems.map((item, index) => (
                                <div key={index} className="flex justify-between text-sm">
                                  <span>{item.description} (Qty: {item.quantity})</span>
                                  <span>{formatCurrency(item.totalPrice)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {quote.notes && (
                          <p className="text-sm text-gray-600 mt-2">
                            <strong>Notes:</strong> {quote.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // TODO: Implement quote view functionality
                            console.log('View quote:', quote.id)
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {workOrder.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-wrap">{workOrder.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Timestamps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <span className="text-gray-600 text-sm sm:text-base">Created:</span>
              <span className="text-sm sm:text-base">{formatDate(workOrder.createdAt)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <span className="text-gray-600 text-sm sm:text-base">Last Updated:</span>
              <span className="text-sm sm:text-base">{formatDate(workOrder.updatedAt)}</span>
            </div>
            {workOrder.approvedAt && (
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
                <span className="text-gray-600 text-sm sm:text-base">Approved:</span>
                <span className="text-sm sm:text-base">{formatDate(workOrder.approvedAt)}</span>
              </div>
            )}
            {workOrder.completedDate && (
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
                <span className="text-gray-600 text-sm sm:text-base">Completed:</span>
                <span className="text-sm sm:text-base">{formatDate(workOrder.completedDate)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end pt-2">
          <Button onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
