'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkOrder, QuoteFormData, QuoteLineItem } from '@/lib/types'
import { Plus, Trash2, Calculator } from 'lucide-react'

interface CreateQuoteModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: QuoteFormData) => void
  isSubmitting?: boolean
  workOrder: WorkOrder | null
}

export default function CreateQuoteModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  workOrder
}: CreateQuoteModalProps) {
  const [formData, setFormData] = useState<QuoteFormData>({
    workOrderId: '',
    laborCost: '',
    materialCost: '',
    additionalCosts: '',
    taxRate: '8.5',
    discountAmount: '',
    validUntil: '',
    lineItems: [],
    notes: '',
    terms: ''
  })

  useEffect(() => {
    if (workOrder) {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + 30) // 30 days from now
      
      setFormData({
        workOrderId: workOrder.id,
        laborCost: workOrder.estimatedCost?.toString() || '',
        materialCost: '',
        additionalCosts: '',
        taxRate: '8.5',
        discountAmount: '',
        validUntil: validUntil.toISOString().split('T')[0],
        lineItems: [],
        notes: '',
        terms: 'Payment due within 30 days of acceptance. Work will begin within 5 business days of signed contract.'
      })
    }
  }, [workOrder])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string, id: string) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const addLineItem = () => {
    const newLineItem: Omit<QuoteLineItem, 'id' | 'totalPrice'> = {
      description: '',
      quantity: 1,
      unitPrice: 0,
      category: 'labor'
    }
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, newLineItem]
    }))
  }

  const removeLineItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index)
    }))
  }

  const updateLineItem = (index: number, field: keyof Omit<QuoteLineItem, 'id' | 'totalPrice'>, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) => 
        i === index 
          ? { 
              ...item, 
              [field]: value,
              totalPrice: field === 'quantity' || field === 'unitPrice' 
                ? (field === 'quantity' ? value as number : item.quantity) * 
                  (field === 'unitPrice' ? value as number : item.unitPrice)
                : item.totalPrice
            }
          : item
      )
    }))
  }

  const calculateTotals = () => {
    const laborCost = parseFloat(formData.laborCost) || 0
    const materialCost = parseFloat(formData.materialCost) || 0
    const additionalCosts = parseFloat(formData.additionalCosts) || 0
    const discountAmount = parseFloat(formData.discountAmount || '0') || 0
    const lineItemsTotal = formData.lineItems.reduce((sum, item) => sum + item.totalPrice, 0)
    
    const subtotal = laborCost + materialCost + additionalCosts + lineItemsTotal - discountAmount
    const taxRate = parseFloat(formData.taxRate) || 0
    const taxAmount = subtotal * (taxRate / 100)
    const total = subtotal + taxAmount

    return { subtotal, taxAmount, total }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen || !workOrder) return null

  const { subtotal, taxAmount, total } = calculateTotals()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Create Quote for Work Order
          </CardTitle>
          <p className="text-sm text-gray-600">
            {workOrder.title} - {workOrder.location.name}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Work Order Info */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Work Order Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Title:</strong> {workOrder.title}</p>
                  <p><strong>Client:</strong> {workOrder.clientName}</p>
                </div>
                <div>
                  <p><strong>Location:</strong> {workOrder.location.name}</p>
                  <p><strong>Priority:</strong> {workOrder.priority}</p>
                </div>
              </div>
              <p className="mt-2 text-sm"><strong>Description:</strong> {workOrder.description}</p>
            </div>

            {/* Cost Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="laborCost">Labor Cost ($)</Label>
                <Input
                  id="laborCost"
                  type="number"
                  step="0.01"
                  value={formData.laborCost}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="materialCost">Material Cost ($)</Label>
                <Input
                  id="materialCost"
                  type="number"
                  step="0.01"
                  value={formData.materialCost}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additionalCosts">Additional Costs ($)</Label>
                <Input
                  id="additionalCosts"
                  type="number"
                  step="0.01"
                  value={formData.additionalCosts}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Tax and Discount */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.01"
                  value={formData.taxRate}
                  onChange={handleChange}
                  placeholder="8.5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountAmount">Discount Amount ($)</Label>
                <Input
                  id="discountAmount"
                  type="number"
                  step="0.01"
                  value={formData.discountAmount}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="validUntil">Valid Until</Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={formData.validUntil}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button
                  type="button"
                  size="sm"
                  onClick={addLineItem}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              {formData.lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  <div>
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Unit Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select
                      value={item.category}
                      onValueChange={(value) => updateLineItem(index, 'category', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="labor">Labor</SelectItem>
                        <SelectItem value="material">Material</SelectItem>
                        <SelectItem value="equipment">Equipment</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Total</Label>
                      <Input
                        value={`$${item.totalPrice.toFixed(2)}`}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeLineItem(index)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quote Summary */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Quote Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Labor Cost:</span>
                  <span>${(parseFloat(formData.laborCost) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Material Cost:</span>
                  <span>${(parseFloat(formData.materialCost) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Additional Costs:</span>
                  <span>${(parseFloat(formData.additionalCosts) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Line Items Total:</span>
                  <span>${formData.lineItems.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)}</span>
                </div>
                {parseFloat(formData.discountAmount || '0') > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span>-${(parseFloat(formData.discountAmount || '0')).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t pt-2">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({formData.taxRate}%):</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes and Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Additional notes for the client"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="terms">Terms & Conditions</Label>
                <Textarea
                  id="terms"
                  value={formData.terms}
                  onChange={handleChange}
                  placeholder="Payment terms and conditions"
                  rows={3}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating Quote...' : 'Create Quote'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
