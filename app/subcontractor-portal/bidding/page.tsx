'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/modal'
import { useAuth } from '@/lib/auth'
import { BiddingWorkOrder, QuoteFormData } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Search, 
  DollarSign,
  MapPin,
  Calendar,
  Clock,
  Eye,
  Send,
  FileText
} from 'lucide-react'

export default function SubcontractorBiddingPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [workOrders, setWorkOrders] = useState<BiddingWorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<BiddingWorkOrder | null>(null)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  
  const [quoteForm, setQuoteForm] = useState<QuoteFormData>({
    workOrderId: '',
    laborCost: '',
    materialCost: '',
    additionalCosts: '',
    taxRate: '8.5',
    discountAmount: '',
    validUntil: '',
    lineItems: [],
    notes: '',
    terms: '',
    sendEmail: true
  })

  useEffect(() => {
    if (user?.uid) {
      fetchBiddingWorkOrders()
    }
  }, [user?.uid])

  const fetchBiddingWorkOrders = async () => {
    if (!user?.uid) {
      console.log('No user ID available')
      setLoading(false)
      return
    }

    console.log('🔍 Fetching bidding work orders for user:', user.uid)
    console.log('🔍 User email:', user.email)

    try {
      const url = `/api/subcontractor/bidding-workorders?userId=${user.uid}`
      console.log('🔍 API URL:', url)
      
      const response = await fetch(url)
      console.log('🔍 Response status:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('🔍 Response data:', data)
        console.log('🔍 Number of work orders:', data.length)
        setWorkOrders(data)
      } else {
        const errorText = await response.text()
        console.error('🔍 API Error:', response.status, errorText)
        error('Fetch Error', 'Failed to load work orders for bidding')
      }
    } catch (err) {
      console.error('🔍 Fetch Error:', err)
      error('Fetch Error', 'Error loading work orders for bidding')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setQuoteForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleAddLineItem = () => {
    setQuoteForm(prev => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        {
          description: '',
          quantity: 1,
          unitPrice: 0,
          category: 'labor' as const
        }
      ]
    }))
  }

  const handleLineItemChange = (index: number, field: string, value: any) => {
    setQuoteForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  const handleRemoveLineItem = (index: number) => {
    setQuoteForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index)
    }))
  }

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedWorkOrder) {
      error('Validation Error', 'No work order selected')
      return
    }

    if (!quoteForm.laborCost || !quoteForm.materialCost || !quoteForm.validUntil) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...quoteForm,
          workOrderId: selectedWorkOrder.id,
          subcontractorId: user?.uid
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit quote')
      }

      success('Quote Submitted', 'Your quote has been submitted successfully!')
      setShowQuoteModal(false)
      resetQuoteForm()
      fetchBiddingWorkOrders()
    } catch (err: any) {
      error('Submission Failed', err.message)
    }
  }

  const resetQuoteForm = () => {
    setQuoteForm({
      workOrderId: '',
      laborCost: '',
      materialCost: '',
      additionalCosts: '',
      taxRate: '8.5',
      discountAmount: '',
      validUntil: '',
      lineItems: [],
      notes: '',
      terms: '',
      sendEmail: true
    })
  }

  const openQuoteModal = (workOrder: BiddingWorkOrder) => {
    setSelectedWorkOrder(workOrder)
    
    // Set default valid until date (30 days from now)
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 30)
    
    setQuoteForm(prev => ({
      ...prev,
      workOrderId: workOrder.id,
      validUntil: validUntil.toISOString().split('T')[0]
    }))
    setShowQuoteModal(true)
  }

  const filteredWorkOrders = workOrders.filter(workOrder => {
    const matchesSearch = workOrder.workOrderTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.workOrderDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workOrder.workOrderNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    
    return matchesSearch
  })

  const stats = {
    total: workOrders.length,
    open: workOrders.filter(w => w.status === 'open_for_bidding').length,
    submitted: workOrders.filter(w => w.status === 'quote_submitted').length
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading work orders...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Open for Bidding</h1>
          <p className="text-gray-600">Submit quotes for work orders in your category</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Opportunities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Open for Bidding</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.open}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Quotes Submitted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.submitted}</div>
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
                      <h3 className="text-lg font-semibold">
                        {workOrder.workOrderNumber && (
                          <span className="text-blue-600 font-mono text-sm mr-2">
                            {workOrder.workOrderNumber}
                          </span>
                        )}
                        {workOrder.workOrderTitle}
                      </h3>
                      <Badge className={
                        workOrder.status === 'open_for_bidding' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-green-100 text-green-800'
                      }>
                        {workOrder.status === 'open_for_bidding' ? 'Open for Bidding' : 'Quote Submitted'}
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
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span><strong>Service Date:</strong> {new Date(workOrder.estimatedDateOfService).toLocaleDateString()}</span>
                        </div>
                        <p><strong>Category:</strong> {workOrder.categoryName}</p>
                      </div>
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
                    
                    {workOrder.status === 'open_for_bidding' && (
                      <Button
                        size="sm"
                        onClick={() => openQuoteModal(workOrder)}
                        className="bg-primary hover:bg-primary/90"
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Submit Quote
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
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No work orders available</h3>
                <p className="text-sm">Work orders will appear here when admin shares them for bidding</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quote Submission Modal */}
        <Modal
          isOpen={showQuoteModal}
          onClose={() => setShowQuoteModal(false)}
          title={`Submit Quote - ${selectedWorkOrder?.workOrderTitle}`}
        >
          <form onSubmit={handleSubmitQuote} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="laborCost">Labor Cost *</Label>
                <Input
                  id="laborCost"
                  type="number"
                  step="0.01"
                  value={quoteForm.laborCost}
                  onChange={(e) => handleInputChange('laborCost', e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="materialCost">Material Cost *</Label>
                <Input
                  id="materialCost"
                  type="number"
                  step="0.01"
                  value={quoteForm.materialCost}
                  onChange={(e) => handleInputChange('materialCost', e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="additionalCosts">Additional Costs</Label>
                <Input
                  id="additionalCosts"
                  type="number"
                  step="0.01"
                  value={quoteForm.additionalCosts}
                  onChange={(e) => handleInputChange('additionalCosts', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.01"
                  value={quoteForm.taxRate}
                  onChange={(e) => handleInputChange('taxRate', e.target.value)}
                  placeholder="8.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="validUntil">Quote Valid Until *</Label>
              <Input
                id="validUntil"
                type="date"
                value={quoteForm.validUntil}
                onChange={(e) => handleInputChange('validUntil', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={quoteForm.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes or special conditions"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea
                id="terms"
                value={quoteForm.terms}
                onChange={(e) => handleInputChange('terms', e.target.value)}
                placeholder="Terms and conditions for this quote"
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowQuoteModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                <Send className="h-4 w-4 mr-2" />
                Submit Quote
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </>
  )
}
