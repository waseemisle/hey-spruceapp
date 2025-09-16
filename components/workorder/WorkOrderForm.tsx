'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkOrder, WorkOrderFormData, Location } from '@/lib/types'

interface WorkOrderFormProps {
  initialData?: WorkOrder | null
  onSubmit: (data: WorkOrderFormData) => void
  onCancel: () => void
  isSubmitting?: boolean
  locations: Location[]
  isAdmin?: boolean
}

export default function WorkOrderForm({ 
  initialData, 
  onSubmit, 
  onCancel, 
  isSubmitting = false,
  locations,
  isAdmin = false
}: WorkOrderFormProps) {
  const [formData, setFormData] = useState<WorkOrderFormData>({
    title: '',
    description: '',
    priority: 'medium',
    category: 'maintenance',
    locationId: '',
    estimatedCost: '',
    estimatedDuration: '',
    scheduledDate: '',
    notes: ''
  })


  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        description: initialData.description,
        priority: initialData.priority,
        category: initialData.category,
        locationId: initialData.location.id,
        estimatedCost: initialData.estimatedCost?.toString() || '',
        estimatedDuration: initialData.estimatedDuration?.toString() || '',
        scheduledDate: initialData.scheduledDate || '',
        notes: initialData.notes || ''
      })
    }
  }, [initialData])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({ 
      ...prev, 
      [id]: id === 'estimatedCost' || id === 'estimatedDuration' 
        ? parseFloat(value) || 0 
        : value 
    }))
  }

  const handleSelectChange = (value: string, id: string) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleDateChange = (value: string) => {
    setFormData(prev => ({ ...prev, scheduledDate: value }))
  }


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {initialData ? 'Edit Work Order' : 'Create New Work Order'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Work order title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={(value) => handleSelectChange(value, 'category')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select value={formData.priority} onValueChange={(value) => handleSelectChange(value, 'priority')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationId">Location *</Label>
              <Select value={formData.locationId} onValueChange={(value) => handleSelectChange(value, 'locationId')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name} - {location.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Detailed description of the work required"
              rows={4}
              required
            />
          </div>

          {/* Cost and Duration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Estimated Cost ($)</Label>
              <Input
                id="estimatedCost"
                type="number"
                step="0.01"
                value={formData.estimatedCost}
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedDuration">Estimated Duration (hours)</Label>
              <Input
                id="estimatedDuration"
                type="number"
                step="0.5"
                value={formData.estimatedDuration}
                onChange={handleChange}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date</Label>
              <Input
                id="scheduledDate"
                type="datetime-local"
                value={formData.scheduledDate}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
          </div>


          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any additional notes or special instructions"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : initialData ? 'Update Work Order' : 'Create Work Order'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
