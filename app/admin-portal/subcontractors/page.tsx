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
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Eye,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Edit,
  Plus
} from 'lucide-react'
import Modal from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { Subcontractor } from '@/lib/types'

export default function AdminSubcontractorsPage() {
  const { user } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [categories, setCategories] = useState<any[]>([])
  
  // Modal states
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Subcontractor | null>(null)
  
  // Edit form state
  const [editFormData, setEditFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    title: '',
    categoryId: '',
    hourlyRate: '',
    experience: '',
    skills: '',
    availability: 'available',
    businessName: '',
    businessAddress: '',
    notes: ''
  })

  // Create form state
  const [createFormData, setCreateFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    title: '',
    categoryId: '',
    hourlyRate: '',
    experience: '',
    skills: '',
    availability: 'available',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: ''
    },
    businessInfo: {
      businessName: '',
      address: ''
    },
    notes: ''
  })

  useEffect(() => {
    // Fetch subcontractors
    const subcontractorsQuery = db.collection('subcontractors').orderBy('createdAt', 'desc')
    const unsubscribeSubcontractors = subcontractorsQuery.onSnapshot( 
      (snapshot) => {
        const subcontractorsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Subcontractor[]
        setSubcontractors(subcontractorsData)
      },
      (err) => {
        console.error('Error fetching subcontractors:', err)
        error('Fetch Error', 'Failed to load subcontractors')
      }
    )

    // Fetch categories
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories')
        if (response.ok) {
          const data = await response.json()
          setCategories(data)
        }
      } catch (err) {
        console.error('Error fetching categories:', err)
      }
    }
    fetchCategories()

    return () => {
      unsubscribeSubcontractors()
    }
  }, [])

  const handleApproveSubcontractor = async (subcontractorId: string) => {
    try {
      const response = await fetch('/api/admin/subcontractors/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subcontractorId,
          adminId: user?.uid
        })
      })

      if (response.ok) {
        success('Subcontractor Approved', 'Subcontractor has been approved successfully!')
      } else {
        const errorData = await response.json()
        error('Approval Failed', errorData.error || 'Failed to approve subcontractor')
      }
    } catch (err) {
      console.error('Error approving subcontractor:', err)
      error('Error', 'Failed to approve subcontractor')
    }
  }

  const handleRejectSubcontractor = async (subcontractorId: string) => {
    const reason = prompt('Please provide a reason for rejection:')
    if (!reason) return

    try {
      const response = await fetch('/api/admin/subcontractors/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subcontractorId,
          adminId: user?.uid,
          reason
        })
      })

      if (response.ok) {
        success('Subcontractor Rejected', 'Subcontractor has been rejected successfully!')
      } else {
        const errorData = await response.json()
        error('Rejection Failed', errorData.error || 'Failed to reject subcontractor')
      }
    } catch (err) {
      console.error('Error rejecting subcontractor:', err)
      error('Error', 'Failed to reject subcontractor')
    }
  }

  const handleViewSubcontractor = (subcontractor: Subcontractor) => {
    setSelectedSubcontractor(subcontractor)
    setShowViewModal(true)
  }

  const handleEditSubcontractor = (subcontractor: Subcontractor) => {
    setSelectedSubcontractor(subcontractor)
    setEditFormData({
      fullName: subcontractor.fullName || '',
      email: subcontractor.email || '',
      phone: subcontractor.phone || '',
      title: subcontractor.title || '',
      categoryId: subcontractor.categoryId || '',
      hourlyRate: subcontractor.hourlyRate?.toString() || '',
      experience: subcontractor.experience || '',
      skills: subcontractor.skills?.join(', ') || '',
      availability: subcontractor.availability || 'available',
      businessName: subcontractor.businessInfo?.businessName || '',
      businessAddress: subcontractor.address ? `${subcontractor.address.street}, ${subcontractor.address.city}, ${subcontractor.address.state}` : '',
      notes: ''
    })
    setShowEditModal(true)
  }

  const handleInputChange = (field: string, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleUpdateSubcontractor = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedSubcontractor || !editFormData.fullName || !editFormData.email || !editFormData.categoryId) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    try {
      const response = await fetch(`/api/admin/subcontractors/${selectedSubcontractor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editFormData,
          hourlyRate: editFormData.hourlyRate ? parseFloat(editFormData.hourlyRate) : null,
          skills: editFormData.skills.split(',').map(skill => skill.trim()).filter(skill => skill),
          updatedBy: user?.uid
        })
      })

      if (response.ok) {
        success('Subcontractor Updated', 'Subcontractor information updated successfully!')
        setShowEditModal(false)
        setSelectedSubcontractor(null)
      } else {
        const errorData = await response.json()
        error('Update Failed', errorData.error || 'Failed to update subcontractor')
      }
    } catch (err) {
      console.error('Error updating subcontractor:', err)
      error('Error', 'Failed to update subcontractor')
    }
  }

  const handleCreateInputChange = (field: string, value: string | object) => {
    if (field === 'address' || field === 'businessInfo') {
      setCreateFormData(prev => ({
        ...prev,
         [field]: value
      }))
    } else {
      setCreateFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  const handleCreateSubcontractor = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!createFormData.fullName || !createFormData.email || !createFormData.categoryId) {
      error('Validation Error', 'Please fill in all required fields')
      return
    }

    try {
      const response = await fetch('/api/admin/subcontractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createFormData,
          hourlyRate: createFormData.hourlyRate ? parseFloat(createFormData.hourlyRate) : null,
          skills: createFormData.skills.split(',').map(skill => skill.trim()).filter(skill => skill),
          status: 'approved', // Admin-created subcontractors are automatically approved
          createdBy: user?.uid
        })
      })

      if (response.ok) {
        success('Subcontractor Created', 'Subcontractor has been created successfully!')
        setShowCreateModal(false)
        resetCreateForm()
      } else {
        const errorData = await response.json()
        error('Creation Failed', errorData.error || 'Failed to create subcontractor')
      }
    } catch (err) {
      console.error('Error creating subcontractor:', err)
      error('Error', 'Failed to create subcontractor')
    }
  }

  const resetCreateForm = () => {
    setCreateFormData({
      fullName: '',
      email: '',
      phone: '',
      title: '',
      categoryId: '',
      hourlyRate: '',
      experience: '',
      skills: '',
      availability: 'available',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: ''
      },
      businessInfo: {
        businessName: '',
        address: ''
      },
      notes: ''
    })
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const getAvailabilityBadge = (availability: string) => {
    const variants = {
      available: 'bg-green-100 text-green-800',
      busy: 'bg-yellow-100 text-yellow-800',
      unavailable: 'bg-red-100 text-red-800'
    }
    return variants[availability as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const filteredSubcontractors = subcontractors.filter(subcontractor => {
    const matchesSearch = subcontractor.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         subcontractor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         subcontractor.title?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || subcontractor.status === filterStatus
    const matchesCategory = filterCategory === 'all' || subcontractor.categoryId === filterCategory
    
    return matchesSearch && matchesStatus && matchesCategory
  })

  const stats = {
    total: subcontractors.length,
    pending: subcontractors.filter(s => s.status === 'pending').length,
    approved: subcontractors.filter(s => s.status === 'approved').length,
    rejected: subcontractors.filter(s => s.status === 'rejected').length
  }

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    return category ? category.name : 'Unknown'
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Subcontractor Management</h1>
          <Button 
            onClick={() => setShowCreateModal(true)} 
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Subcontractor
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Subcontractors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approved}</div>
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
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search subcontractors..."
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subcontractors List */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subcontractor Registrations</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredSubcontractors.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>No subcontractors found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSubcontractors.map((subcontractor) => (
                    <div key={subcontractor.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{subcontractor.fullName}</h3>
                            <Badge className={getStatusBadge(subcontractor.status)}>
                              {subcontractor.status}
                            </Badge>
                            <Badge className={getAvailabilityBadge(subcontractor.availability)}>
                              {subcontractor.availability}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                            <div>
                              <p><strong>Title:</strong> {subcontractor.title}</p>
                              <p><strong>Category:</strong> {getCategoryName(subcontractor.categoryId)}</p>
                              <p><strong>Email:</strong> {subcontractor.email}</p>
                              <p><strong>Phone:</strong> {subcontractor.phone}</p>
                            </div>
                            <div>
                              <p><strong>Experience:</strong> {subcontractor.experience}</p>
                              <p><strong>Hourly Rate:</strong> {subcontractor.hourlyRate ? `$${subcontractor.hourlyRate}` : 'Not specified'}</p>
                              <p><strong>Skills:</strong> {subcontractor.skills?.join(', ') || 'None'}</p>
                            </div>
                          </div>
                          
                          <div className="mt-3">
                            <p className="text-sm text-gray-600">
                              <strong>Address:</strong> {subcontractor.address.street}, {subcontractor.address.city}, {subcontractor.address.state} {subcontractor.address.zipCode}
                            </p>
                          </div>
                          
                          {subcontractor.businessInfo?.businessName && (
                            <div className="mt-2">
                              <p className="text-sm text-gray-600">
                                <strong>Business:</strong> {subcontractor.businessInfo.businessName}
                              </p>
                            </div>
                          )}
                          
                          <p className="text-sm text-gray-600 mt-2">
                            <strong>Registered:</strong> {new Date(subcontractor.createdAt).toLocaleString()}
                          </p>
                        </div>
                        
                        <div className="flex gap-2 ml-4">
                          {/* View and Edit buttons - always available */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewSubcontractor(subcontractor)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditSubcontractor(subcontractor)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>

                          {/* Approve/Reject buttons - only for pending status */}
                          {subcontractor.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApproveSubcontractor(subcontractor.id)}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRejectSubcontractor(subcontractor.id)}
                                className="border-red-300 text-red-600 hover:bg-red-50"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          
                          {subcontractor.status === 'rejected' && subcontractor.rejectionReason && (
                            <div className="text-sm text-red-600">
                              <strong>Reason:</strong> {subcontractor.rejectionReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* View Subcontractor Modal */}
        <Modal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          title="Subcontractor Details"
        >
          {selectedSubcontractor && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-semibold text-lg">{selectedSubcontractor.fullName}</h3>
                  <Badge className={getStatusBadge(selectedSubcontractor.status)}>
                    {selectedSubcontractor.status}
                  </Badge>
                  <Badge className={getAvailabilityBadge(selectedSubcontractor.availability)}>
                    {selectedSubcontractor.availability}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <p><strong>Title:</strong> {selectedSubcontractor.title}</p>
                    <p><strong>Category:</strong> {getCategoryName(selectedSubcontractor.categoryId)}</p>
                    <p><strong>Email:</strong> {selectedSubcontractor.email}</p>
                    <p><strong>Phone:</strong> {selectedSubcontractor.phone}</p>
                    <p><strong>Experience:</strong> {selectedSubcontractor.experience}</p>
                  </div>
                  <div className="space-y-2">
                    <p><strong>Hourly Rate:</strong> {selectedSubcontractor.hourlyRate ? `$${selectedSubcontractor.hourlyRate}` : 'Not specified'}</p>
                    <p><strong>Skills:</strong> {selectedSubcontractor.skills?.join(', ') || 'None'}</p>
                    <p><strong>Registered:</strong> {new Date(selectedSubcontractor.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="text-sm"><strong>Address:</strong></p>
                  <p className="text-sm text-gray-600">
                    {selectedSubcontractor.address?.street}, {selectedSubcontractor.address?.city}, {selectedSubcontractor.address?.state} {selectedSubcontractor.address?.zipCode}
                  </p>
                </div>
                
                {selectedSubcontractor.businessInfo?.businessName && (
                  <div className="mt-4">
                    <p className="text-sm"><strong>Business Information:</strong></p>
                    <p className="text-sm text-gray-600">
                      <strong>Name:</strong> {selectedSubcontractor.businessInfo.businessName}
                    </p>
                    {selectedSubcontractor.address && (
                      <p className="text-sm text-gray-600">
                        <strong>Address:</strong> {selectedSubcontractor.address.street}, {selectedSubcontractor.address.city}, {selectedSubcontractor.address.state}
                      </p>
                    )}
                  </div>
                )}
                
                
                {selectedSubcontractor.status === 'rejected' && selectedSubcontractor.rejectionReason && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                    <p className="text-sm text-red-700">
                      <strong>Rejection Reason:</strong> {selectedSubcontractor.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setShowViewModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Edit Subcontractor Modal */}
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit Subcontractor"
        >
          <form onSubmit={handleUpdateSubcontractor} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={editFormData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={editFormData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editFormData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="categoryId">Category *</Label>
              <Select value={editFormData.categoryId} onValueChange={(value) => handleInputChange('categoryId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="hourlyRate">Hourly Rate</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  value={editFormData.hourlyRate}
                  onChange={(e) => handleInputChange('hourlyRate', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="availability">Availability</Label>
                <Select value={editFormData.availability} onValueChange={(value) => handleInputChange('availability', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="busy">Busy</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="experience">Experience</Label>
              <Textarea
                id="experience"
                value={editFormData.experience}
                onChange={(e) => handleInputChange('experience', e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input
                id="skills"
                value={editFormData.skills}
                onChange={(e) => handleInputChange('skills', e.target.value)}
                placeholder="e.g., Plumbing, Electrical, HVAC"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  value={editFormData.businessName}
                  onChange={(e) => handleInputChange('businessName', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="businessAddress">Business Address</Label>
                <Input
                  id="businessAddress"
                  value={editFormData.businessAddress}
                  onChange={(e) => handleInputChange('businessAddress', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={editFormData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                placeholder="Additional notes about this subcontractor..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                Update Subcontractor
              </Button>
            </div>
          </form>
        </Modal>

        {/* Create Subcontractor Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Add New Subcontractor"
        >
          <form onSubmit={handleCreateSubcontractor} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-fullName">Full Name *</Label>
                <Input
                  id="create-fullName"
                  value={createFormData.fullName}
                  onChange={(e) => handleCreateInputChange('fullName', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="create-email">Email *</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createFormData.email}
                  onChange={(e) => handleCreateInputChange('email', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-phone">Phone</Label>
                <Input
                  id="create-phone"
                  value={createFormData.phone}
                  onChange={(e) => handleCreateInputChange('phone', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="create-title">Title</Label>
                <Input
                  id="create-title"
                  value={createFormData.title}
                  onChange={(e) => handleCreateInputChange('title', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-categoryId">Category *</Label>
                <Select value={createFormData.categoryId} onValueChange={(value) => handleCreateInputChange('categoryId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="create-hourlyRate">Hourly Rate</Label>
                <Input
                  id="create-hourlyRate"
                  type="number"
                  value={createFormData.hourlyRate}
                  onChange={(e) => handleCreateInputChange('hourlyRate', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-availability">Availability</Label>
                <Select value={createFormData.availability} onValueChange={(value) => handleCreateInputChange('availability', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="busy">Busy</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="create-skills">Skills (comma-separated)</Label>
                <Input
                  id="create-skills"
                  value={createFormData.skills}
                  onChange={(e) => handleCreateInputChange('skills', e.target.value)}
                  placeholder="e.g., Plumbing, Electrical, HVAC"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="create-experience">Experience</Label>
              <Textarea
                id="create-experience"
                value={createFormData.experience}
                onChange={(e) => handleCreateInputChange('experience', e.target.value)}
                rows={3}
                placeholder="Describe their work experience and background..."
              />
            </div>

            {/* Address Section */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Address Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="create-street">Street Address</Label>
                  <Input
                    id="create-street"
                    value={createFormData.address.street}
                    onChange={(e) => handleCreateInputChange('address', { ...createFormData.address, street: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="create-city">City</Label>
                  <Input
                    id="create-city"
                    value={createFormData.address.city}
                    onChange={(e) => handleCreateInputChange('address', { ...createFormData.address, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="create-state">State</Label>
                  <Input
                    id="create-state"
                    value={createFormData.address.state}
                    onChange={(e) => handleCreateInputChange('address', { ...createFormData.address, state: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="create-zipCode">ZIP Code</Label>
                  <Input
                    id="create-zipCode"
                    value={createFormData.address.zipCode}
                    onChange={(e) => handleCreateInputChange('address', { ...createFormData.address, zipCode: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Business Information Section */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Business Information (Optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="create-businessName">Business Name</Label>
                  <Input
                    id="create-businessName"
                    value={createFormData.businessInfo.businessName}
                    onChange={(e) => handleCreateInputChange('businessInfo', { ...createFormData.businessInfo, businessName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="create-businessAddress">Business Address</Label>
                  <Input
                    id="create-businessAddress"
                    value={createFormData.businessInfo.address}
                    onChange={(e) => handleCreateInputChange('businessInfo', { ...createFormData.businessInfo, address: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="create-notes">Admin Notes</Label>
              <Textarea
                id="create-notes"
                value={createFormData.notes}
                onChange={(e) => handleCreateInputChange('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes about this subcontractor..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateModal(false)
                  resetCreateForm()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                Create Subcontractor
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </>
  )
}