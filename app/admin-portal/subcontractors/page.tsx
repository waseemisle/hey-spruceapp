'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { Subcontractor } from '@/lib/types'
import WithRoleProtection from '@/components/auth/withRoleProtection'
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  Star,
  DollarSign,
  Briefcase,
  User,
  Building,
  FileText
} from 'lucide-react'

export default function AdminSubcontractorsPage() {
  return (
    <WithRoleProtection 
      allowedRoles={['admin']}
      fallbackMessage="This subcontractors page is only accessible to administrators."
    >
      <AdminSubcontractorsContent />
    </WithRoleProtection>
  )
}

function AdminSubcontractorsContent() {
  const { user, profile } = useAuth()
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Subcontractor | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchSubcontractors()
  }, [])

  const fetchSubcontractors = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/subcontractors')
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error fetching subcontractors:', errorText)
        setError('Failed to fetch subcontractors')
        return
      }

      const data = await response.json()
      console.log('Subcontractors fetched:', data)
      setSubcontractors(data.subcontractors || [])
    } catch (error) {
      console.error('Error fetching subcontractors:', error)
      setError('Failed to fetch subcontractors')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (subcontractorId: string) => {
    try {
      setActionLoading(subcontractorId)
      const response = await fetch(`/api/admin/subcontractors/${subcontractorId}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId: user?.uid,
          adminName: profile?.fullName || 'Admin'
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error approving subcontractor:', errorText)
        alert('Failed to approve subcontractor')
        return
      }

      const data = await response.json()
      console.log('Subcontractor approved:', data)
      
      // Refresh subcontractors list
      await fetchSubcontractors()
      alert('Subcontractor approved successfully!')
    } catch (error) {
      console.error('Error approving subcontractor:', error)
      alert('Failed to approve subcontractor')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (subcontractorId: string) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection')
      return
    }

    try {
      setActionLoading(subcontractorId)
      const response = await fetch(`/api/admin/subcontractors/${subcontractorId}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId: user?.uid,
          adminName: profile?.fullName || 'Admin',
          rejectionReason: rejectionReason
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error rejecting subcontractor:', errorText)
        alert('Failed to reject subcontractor')
        return
      }

      const data = await response.json()
      console.log('Subcontractor rejected:', data)
      
      // Refresh subcontractors list
      await fetchSubcontractors()
      setSelectedSubcontractor(null)
      setRejectionReason('')
      alert('Subcontractor rejected')
    } catch (error) {
      console.error('Error rejecting subcontractor:', error)
      alert('Failed to reject subcontractor')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getAvailabilityBadge = (availability: string) => {
    switch (availability) {
      case 'available':
        return 'bg-green-100 text-green-800'
      case 'busy':
        return 'bg-yellow-100 text-yellow-800'
      case 'unavailable':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const filteredSubcontractors = subcontractors.filter(subcontractor => {
    const matchesSearch = subcontractor.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         subcontractor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         subcontractor.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         subcontractor.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = filterStatus === 'all' || subcontractor.status === filterStatus
    
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Loading subcontractors...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchSubcontractors}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Subcontractors</h1>
        <p className="text-gray-600">Manage subcontractor registrations and approvals</p>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="search"
              placeholder="Search by name, email, title, or skills..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <div>
          <Label htmlFor="status">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Subcontractors List */}
      {filteredSubcontractors.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No subcontractors found</h3>
              <p className="text-gray-600">No subcontractors match your current filters.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {filteredSubcontractors.map((subcontractor) => (
            <Card key={subcontractor.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {subcontractor.fullName}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {subcontractor.title} • {subcontractor.email}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={`${getStatusBadge(subcontractor.status)} text-sm`}>
                      {subcontractor.status.toUpperCase()}
                    </Badge>
                    <Badge className={`${getAvailabilityBadge(subcontractor.availability)} text-sm`}>
                      {subcontractor.availability.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-semibold">{subcontractor.phone}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Location</p>
                      <p className="font-semibold">{subcontractor.address.city}, {subcontractor.address.state}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Experience</p>
                      <p className="font-semibold">{subcontractor.experience}</p>
                    </div>
                  </div>
                  
                  {subcontractor.hourlyRate && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Hourly Rate</p>
                        <p className="font-semibold">${subcontractor.hourlyRate}/hr</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {subcontractor.skills.map((skill, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                {subcontractor.businessInfo?.businessName && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Business Information</h4>
                    <p className="text-gray-600">
                      <strong>Business:</strong> {subcontractor.businessInfo.businessName}
                      {subcontractor.businessInfo.licenseNumber && (
                        <span> • <strong>License:</strong> {subcontractor.businessInfo.licenseNumber}</span>
                      )}
                    </p>
                  </div>
                )}

                {subcontractor.references && subcontractor.references.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">References</h4>
                    <div className="space-y-2">
                      {subcontractor.references.map((ref, index) => (
                        <div key={index} className="text-sm text-gray-600">
                          <strong>{ref.name}</strong> - {ref.contact} ({ref.relationship})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  {subcontractor.status === 'pending' && (
                    <>
                      <Button
                        onClick={() => handleApprove(subcontractor.id)}
                        disabled={actionLoading === subcontractor.id}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {actionLoading === subcontractor.id ? (
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Approve
                      </Button>
                      
                      <Button
                        onClick={() => setSelectedSubcontractor(subcontractor)}
                        disabled={actionLoading === subcontractor.id}
                        variant="destructive"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </>
                  )}
                  
                  {subcontractor.status === 'approved' && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Approved</span>
                    </div>
                  )}
                  
                  {subcontractor.status === 'rejected' && (
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span className="font-medium">Rejected</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rejection Modal */}
      {selectedSubcontractor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Reject Subcontractor</CardTitle>
              <CardDescription>
                Please provide a reason for rejecting {selectedSubcontractor.fullName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="rejectionReason">Reason for Rejection *</Label>
                <Textarea
                  id="rejectionReason"
                  placeholder="Please explain why this application is being rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedSubcontractor(null)
                    setRejectionReason('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleReject(selectedSubcontractor.id)}
                  disabled={!rejectionReason.trim() || actionLoading === selectedSubcontractor.id}
                  variant="destructive"
                >
                  {actionLoading === selectedSubcontractor.id ? (
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

