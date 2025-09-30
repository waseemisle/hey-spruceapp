'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Quote, InvoiceFormData } from '@/lib/types'
import { Receipt, Calendar, FileText, Mail } from 'lucide-react'

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: InvoiceFormData) => void
  isSubmitting?: boolean
  quotes: Quote[]
}

export default function CreateInvoiceModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  quotes
}: CreateInvoiceModalProps) {
  const [formData, setFormData] = useState<InvoiceFormData>({
    quoteId: '',
    workOrderId: '',
    dueDate: '',
    notes: '',
    terms: '',
    paymentTerms: 'Payment due within 30 days of invoice date.',
    sendEmail: true
  })

  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Set default due date to 30 days from now
      const defaultDueDate = new Date()
      defaultDueDate.setDate(defaultDueDate.getDate() + 30)
      
      setFormData({
        quoteId: '',
        workOrderId: '',
        dueDate: defaultDueDate.toISOString().split('T')[0],
        notes: '',
        terms: '',
        paymentTerms: 'Payment due within 30 days of invoice date.',
        sendEmail: true
      })
      setSelectedQuote(null)
    }
  }, [isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string, id: string) => {
    if (id === 'quoteId') {
      const quote = quotes.find(q => q.id === value)
      setSelectedQuote(quote || null)
      setFormData(prev => ({ 
        ...prev, 
        [id]: value,
        workOrderId: quote?.workOrderId || ''
      }))
    } else {
      setFormData(prev => ({ ...prev, [id]: value }))
    }
  }

  const handleCheckboxChange = (checked: boolean, id: string) => {
    setFormData(prev => ({ ...prev, [id]: checked }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Create Invoice from Quote
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Quote Selection */}
            <div className="space-y-2">
              <Label htmlFor="quoteId">Select Quote *</Label>
              <Select
                value={formData.quoteId}
                onValueChange={(value) => handleSelectChange(value, 'quoteId')}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an approved quote" />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((quote) => (
                    <SelectItem key={quote.id} value={quote.id}>
                      {quote.workOrderTitle} - ${quote.clientAmount.toLocaleString()} - {quote.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {quotes.length === 0 && (
                <p className="text-sm text-gray-500">No approved quotes available. Quotes must be accepted by clients before creating invoices.</p>
              )}
            </div>

            {/* Selected Quote Details */}
            {selectedQuote && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Quote Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><strong>Work Order:</strong> {selectedQuote.workOrderTitle}</p>
                    <p><strong>Client:</strong> {selectedQuote.clientName}</p>
                    <p><strong>Location:</strong> {selectedQuote.workOrderLocation.name}</p>
                  </div>
                  <div>
                    <p><strong>Total Amount:</strong> ${selectedQuote.clientAmount.toLocaleString()}</p>
                    <p><strong>Labor Cost:</strong> ${selectedQuote.laborCost.toLocaleString()}</p>
                    <p><strong>Material Cost:</strong> ${selectedQuote.materialCost.toLocaleString()}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm"><strong>Description:</strong> {selectedQuote.workOrderDescription}</p>
              </div>
            )}

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={handleChange}
                required
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Invoice Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Additional notes for the invoice"
                rows={3}
              />
            </div>

            {/* Terms */}
            <div className="space-y-2">
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea
                id="terms"
                value={formData.terms}
                onChange={handleChange}
                placeholder="Invoice terms and conditions"
                rows={3}
              />
            </div>

            {/* Payment Terms */}
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Textarea
                id="paymentTerms"
                value={formData.paymentTerms}
                onChange={handleChange}
                placeholder="Payment terms and conditions"
                rows={2}
              />
            </div>

            {/* Send Email Option */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendEmail"
                checked={formData.sendEmail}
                onCheckedChange={(checked) => handleCheckboxChange(checked as boolean, 'sendEmail')}
              />
              <Label htmlFor="sendEmail" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Send invoice via email to client
              </Label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !formData.quoteId || quotes.length === 0}
              >
                {isSubmitting ? 'Creating Invoice...' : 'Create Invoice'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
