'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Plus, 
  Search, 
  CheckCircle, 
  XCircle, 
  Link,
  Copy,
  Mail,
  MessageSquare
} from 'lucide-react'

export default function AdminClientsPage() {
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error, info } = useNotifications()
  const [clientRegistrations, setClientRegistrations] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  
  // Link generation modal state
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkFormData, setLinkFormData] = useState({
    clientEmail: '',
    clientName: '',
    expiresIn: '7'
  })
  const [generatedLink, setGeneratedLink] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedLinks, setGeneratedLinks] = useState<any[]>([])

  useEffect(() => {
    // Fetch client registrations
    const registrationsQuery = query(collection(db, 'client_registrations'), orderBy('submittedAt', 'desc'))
    const unsubscribeRegistrations = onSnapshot(registrationsQuery, 
      (snapshot) => {
        const registrationsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        console.log('Fetched client registrations:', registrationsData)
        setClientRegistrations(registrationsData)
        setIsLoading(false)
      },
      (error) => {
        console.error('Error fetching client registrations:', error)
        error('Fetch Error', 'Failed to load client registrations')
        setIsLoading(false)
      }
    )

    // Fetch generated links
    const linksQuery = query(collection(db, 'registration_links'), orderBy('createdAt', 'desc'))
    const unsubscribeLinks = onSnapshot(linksQuery, 
      (snapshot) => {
        const linksData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setGeneratedLinks(linksData)
      },
      (error) => {
        console.error('Error fetching registration links:', error)
      }
    )

    return () => {
      unsubscribeRegistrations()
      unsubscribeLinks()
    }
  }, [])

  const handleApproveClient = async (registrationId: string) => {
    try {
      const response = await fetch('/api/admin/approve-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          adminId: user?.uid
        })
      })

      if (response.ok) {
        success('Client Approved', 'Client has been approved successfully!')
      } else {
        const errorData = await response.json()
        error('Approval Failed', errorData.error || 'Failed to approve client')
      }
    } catch (error) {
      console.error('Error approving client:', error)
      error('Error', 'Failed to approve client')
    }
  }

  const handleRejectClient = async (registrationId: string) => {
    // For now, we'll use a simple prompt, but this could be replaced with a modal
    const reason = prompt('Please provide a reason for rejection:')
    if (!reason) return

    try {
      const response = await fetch('/api/admin/reject-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          adminId: user?.uid,
          reason
        })
      })

      if (response.ok) {
        success('Client Rejected', 'Client has been rejected successfully!')
      } else {
        const errorData = await response.json()
        error('Rejection Failed', errorData.error || 'Failed to reject client')
      }
    } catch (error) {
      console.error('Error rejecting client:', error)
      error('Error', 'Failed to reject client')
    }
  }

  const handleGenerateLink = async () => {
    if (!linkFormData.clientEmail || !linkFormData.clientName) {
      error('Required Fields', 'Please fill in all required fields')
      return
    }

    console.log('Generating link with data:', linkFormData)
    setIsGenerating(true)
    try {
      const requestBody = {
        clientEmail: linkFormData.clientEmail,
        clientName: linkFormData.clientName,
        expirationDays: parseInt(linkFormData.expiresIn)
      }
      console.log('Request body:', requestBody)

      const response = await fetch('/api/admin/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      console.log('Response status:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('Response data:', data)
        setGeneratedLink(data.registrationUrl)
        setLinkFormData({ clientEmail: '', clientName: '', expiresIn: '7' })
        success('Link Generated', 'Registration link generated successfully!')
      } else {
        const errorData = await response.json()
        console.error('API Error:', errorData)
        error('Generation Failed', errorData.error || 'Failed to generate link')
      }
    } catch (error) {
      console.error('Error generating link:', error)
      error('Error', 'Failed to generate link')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    info('Link Copied', 'Registration link copied to clipboard!')
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'
  }

  const filteredRegistrations = clientRegistrations.filter(registration => {
    const matchesSearch = registration.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         registration.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         registration.contactName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || registration.status === filterStatus
    
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: clientRegistrations.length,
    pending: clientRegistrations.filter(r => r.status === 'pending').length,
    approved: clientRegistrations.filter(r => r.status === 'approved').length,
    rejected: clientRegistrations.filter(r => r.status === 'rejected').length
  }

  if (isLoading) {
    return <div className="p-6">Loading client registrations...</div>
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Client Management</h1>
          <Button onClick={() => setShowLinkModal(true)}>
            <Link className="w-4 h-4 mr-2" />
            Generate Registration Link
          </Button>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Registrations</CardTitle>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search clients..."
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
          </div>
        </CardContent>
      </Card>

      {/* Client Registrations List */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Client Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredRegistrations.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p>No client registrations found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRegistrations.map((registration) => (
                  <div key={registration.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{registration.companyName}</h3>
                          <Badge className={getStatusBadge(registration.status)}>
                            {registration.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                          <div>
                            <p><strong>Contact:</strong> {registration.contactName}</p>
                            <p><strong>Email:</strong> {registration.email}</p>
                            <p><strong>Phone:</strong> {registration.phone}</p>
                          </div>
                          <div>
                            <p><strong>Business Type:</strong> {registration.businessType}</p>
                            <p><strong>Properties:</strong> {registration.numberOfProperties}</p>
                            <p><strong>Monthly Spend:</strong> {registration.estimatedMonthlySpend}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          <strong>Submitted:</strong> {new Date(registration.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {registration.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApproveClient(registration.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectClient(registration.id)}
                              className="border-red-300 text-red-600 hover:bg-red-50"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {registration.status === 'rejected' && registration.rejectionReason && (
                          <div className="text-sm text-red-600">
                            <strong>Reason:</strong> {registration.rejectionReason}
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

      {/* Generated Links History */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Registration Links</CardTitle>
        </CardHeader>
        <CardContent>
          {generatedLinks.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              <p>No registration links generated yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {generatedLinks.slice(0, 5).map((link) => (
                <div key={link.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="text-sm">
                    <span className="font-medium">{link.clientName}</span> ({link.clientEmail})
                    <span className="text-gray-500 ml-2">
                      - {link.usedAt ? 'Used' : 'Available'}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(link.registrationUrl || `http://localhost:3000/register?token=${link.token}&email=${encodeURIComponent(link.clientEmail)}&name=${encodeURIComponent(link.clientName)}`)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link Generation Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Generate Registration Link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientEmail">Client Email *</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={linkFormData.clientEmail}
                  onChange={(e) => setLinkFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                  placeholder="client@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name *</Label>
                <Input
                  id="clientName"
                  value={linkFormData.clientName}
                  onChange={(e) => setLinkFormData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="Client Company Name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresIn">Expires In (Days)</Label>
                <Select value={linkFormData.expiresIn} onValueChange={(value) => setLinkFormData(prev => ({ ...prev, expiresIn: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Day</SelectItem>
                    <SelectItem value="3">3 Days</SelectItem>
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="14">14 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {generatedLink && (
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm font-medium text-green-800 mb-2">Generated Link:</p>
                  <div className="flex gap-2">
                    <Input value={generatedLink} readOnly className="text-xs" />
                    <Button size="sm" onClick={() => copyToClipboard(generatedLink)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLinkModal(false)
                    setGeneratedLink('')
                  }}
                >
                  Close
                </Button>
                <Button onClick={handleGenerateLink} disabled={isGenerating}>
                  {isGenerating ? 'Generating...' : 'Generate Link'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </>
  )
}