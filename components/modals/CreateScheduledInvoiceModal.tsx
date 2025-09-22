'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScheduledInvoiceFormData, UserProfile } from '@/lib/types'
import { X, Calendar, Clock, DollarSign, User } from 'lucide-react'

interface CreateScheduledInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: ScheduledInvoiceFormData) => void
  isSubmitting?: boolean
  clients: UserProfile[]
}

export default function CreateScheduledInvoiceModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  clients
}: CreateScheduledInvoiceModalProps) {
  const [formData, setFormData] = useState<ScheduledInvoiceFormData>({
    clientId: '',
    title: '',
    description: '',
    amount: '',
    frequency: 'weekly',
    dayOfWeek: '1', // Monday
    time: '09:00',
    timezone: 'America/New_York',
    notes: ''
  })

  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({
        clientId: '',
        title: '',
        description: '',
        amount: '',
        frequency: 'weekly',
        dayOfWeek: '1', // Monday
        time: '09:00',
        timezone: 'America/New_York',
        notes: ''
      })
      setSelectedClient(null)
    }
  }, [isOpen])

  const handleChange = (field: keyof ScheduledInvoiceFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Update selected client when clientId changes
    if (field === 'clientId') {
      const client = clients.find(c => c.id === value)
      setSelectedClient(client || null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const getFrequencyDescription = () => {
    switch (formData.frequency) {
      case 'weekly':
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        return `Every ${dayNames[parseInt(formData.dayOfWeek || '1')]} at ${formData.time} ${formData.timezone}`
      case 'monthly':
        return `Every month on day ${formData.dayOfMonth} at ${formData.time} ${formData.timezone}`
      case 'quarterly':
        return `Every 3 months on day ${formData.dayOfMonth} at ${formData.time} ${formData.timezone}`
      case 'yearly':
        return `Every year on day ${formData.dayOfMonth} at ${formData.time} ${formData.timezone}`
      default:
        return ''
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Create Scheduled Invoice
            </CardTitle>
            <CardDescription>
              Set up recurring invoices for clients
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Client Selection */}
            <div className="space-y-2">
              <Label htmlFor="clientId" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Client *
              </Label>
              <Select value={formData.clientId} onValueChange={(value) => handleChange('clientId', value)}>
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
              {selectedClient && (
                <p className="text-sm text-gray-600">
                  Selected: {selectedClient.fullName} - {selectedClient.email}
                </p>
              )}
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Invoice Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="e.g., Monthly Maintenance Fee"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Amount *
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => handleChange('amount', e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Describe what this invoice is for..."
                rows={3}
              />
            </div>

            {/* Schedule Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Schedule Settings
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency *</Label>
                  <Select value={formData.frequency} onValueChange={(value) => handleChange('frequency', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone *</Label>
                  <Select value={formData.timezone} onValueChange={(value) => handleChange('timezone', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time (EST/EDT)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (CST/CDT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (MST/MDT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (PST/PDT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.frequency === 'weekly' && (
                  <div className="space-y-2">
                    <Label htmlFor="dayOfWeek">Day of Week *</Label>
                    <Select value={formData.dayOfWeek} onValueChange={(value) => handleChange('dayOfWeek', value)}>
                      <SelectTrigger>
                        <SelectValue />
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

                {(formData.frequency === 'monthly' || formData.frequency === 'quarterly' || formData.frequency === 'yearly') && (
                  <div className="space-y-2">
                    <Label htmlFor="dayOfMonth">Day of Month *</Label>
                    <Select value={formData.dayOfMonth} onValueChange={(value) => handleChange('dayOfMonth', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <SelectItem key={day} value={day.toString()}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="time">Time *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => handleChange('time', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Schedule Preview */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Schedule Preview:</h4>
                <p className="text-blue-800">{getFrequencyDescription()}</p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Additional notes for this scheduled invoice..."
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !formData.clientId || !formData.title || !formData.amount}>
                {isSubmitting ? 'Creating...' : 'Create Scheduled Invoice'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
