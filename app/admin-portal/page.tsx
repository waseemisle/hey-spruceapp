'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { formatCurrency, formatDate, getStatusColor, getPriorityColor } from '@/lib/utils'
import BarChart from '@/components/charts/BarChart'
import LineChart from '@/components/charts/LineChart'
import PieChart from '@/components/charts/PieChart'
import { 
  Users, 
  Building2, 
  Wrench, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  Link as LinkIcon,
  Calendar,
  ArrowLeft
} from 'lucide-react'

// Mock data - in real app, this would come from Supabase
const mockData = {
  stats: {
    totalUsers: 1247,
    totalProperties: 342,
    activeWorkOrders: 89,
    monthlyRevenue: 125000
  },
  recentWorkOrders: [
    {
      id: 'WO-001',
      title: 'HVAC Maintenance',
      property: 'Downtown Office Complex',
      client: 'Acme Corp',
      status: 'in-progress',
      priority: 'high',
      estimatedCost: 2500,
      dueDate: '2024-01-15'
    },
    {
      id: 'WO-002',
      title: 'Plumbing Repair',
      property: 'Residential Complex A',
      client: 'Housing Authority',
      status: 'pending',
      priority: 'medium',
      estimatedCost: 1200,
      dueDate: '2024-01-20'
    },
    {
      id: 'WO-003',
      title: 'Landscaping Service',
      property: 'Corporate Campus',
      client: 'Tech Solutions Inc',
      status: 'completed',
      priority: 'low',
      estimatedCost: 800,
      dueDate: '2024-01-10'
    }
  ],
  chartData: {
    revenue: [
      { label: 'Jan', value: 95000, color: '#6366f1' },
      { label: 'Feb', value: 110000, color: '#6366f1' },
      { label: 'Mar', value: 125000, color: '#6366f1' },
      { label: 'Apr', value: 130000, color: '#6366f1' },
      { label: 'May', value: 125000, color: '#6366f1' }
    ],
    workOrdersTrend: [
      { date: '2024-01-01', value: 45 },
      { date: '2024-01-02', value: 52 },
      { date: '2024-01-03', value: 48 },
      { date: '2024-01-04', value: 61 },
      { date: '2024-01-05', value: 55 },
      { date: '2024-01-06', value: 67 },
      { date: '2024-01-07', value: 72 }
    ],
    statusDistribution: [
      { label: 'Completed', value: 45, color: '#10b981' },
      { label: 'In Progress', value: 28, color: '#f59e0b' },
      { label: 'Pending', value: 16, color: '#6b7280' }
    ]
  }
}


export default function AdminPortal() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [activeSection, setActiveSection] = useState('dashboard')
  
  // Link generation state
  const [linkFormData, setLinkFormData] = useState({
    clientEmail: '',
    clientName: '',
    expirationDays: '7'
  })
  const [generatedLink, setGeneratedLink] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedLinks, setGeneratedLinks] = useState<any[]>([])
  
  // Client registrations state
  const [clientRegistrations, setClientRegistrations] = useState<any[]>([])

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.push('/portal-login')
      return
    }

    if (profile && profile.role !== 'admin') {
      router.push('/portal-login')
      return
    }
  }, [user, profile, loading, router])

  // Fetch client registrations from Firestore
  useEffect(() => {
    if (profile && profile.role === 'admin') {
      const q = query(
        collection(db, 'client_registrations'),
        orderBy('submittedAt', 'desc')
      )
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const registrations = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        console.log('Fetched client registrations:', registrations)
        setClientRegistrations(registrations)
      }, (error) => {
        console.error('Error fetching client registrations:', error)
      })

      return () => unsubscribe()
    }
  }, [profile])


  const handleGenerateLink = async () => {
    if (!linkFormData.clientEmail || !linkFormData.clientName) {
      alert('Please fill in all required fields')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/admin/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientEmail: linkFormData.clientEmail,
          clientName: linkFormData.clientName,
          expirationDays: parseInt(linkFormData.expirationDays)
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate link')
      }

      const data = await response.json()
      setGeneratedLink(data.registrationUrl)
      
      // Add to generated links list
      const newLink = {
        id: Date.now(),
        clientEmail: linkFormData.clientEmail,
        clientName: linkFormData.clientName,
        registrationUrl: data.registrationUrl,
        expiresAt: data.expiresAt,
        createdAt: new Date().toISOString(),
        status: 'active'
      }
      setGeneratedLinks(prev => [newLink, ...prev])
      
      // Reset form
      setLinkFormData({
        clientEmail: '',
        clientName: '',
        expirationDays: '7'
      })
      
    } catch (error) {
      console.error('Error generating link:', error)
      alert('Failed to generate registration link. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Link copied to clipboard!')
  }

  const shareViaEmail = (link: string) => {
    const subject = 'Spruce App - Client Registration Link'
    const body = `Hello,\n\nYou have been invited to register as a client on Spruce App.\n\nPlease use the following link to complete your registration:\n\n${link}\n\nBest regards,\nSpruce App Team`
    window.open(`mailto:${linkFormData.clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  const shareViaWhatsApp = (link: string) => {
    const message = `Hello! You have been invited to register as a client on Spruce App. Please use this link to complete your registration: ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`)
  }

  const handleApproveClient = async (registrationId: string) => {
    try {
      const response = await fetch('/api/admin/approve-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ registrationId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to approve client')
      }

      alert('Client approved successfully!')
    } catch (error) {
      console.error('Error approving client:', error)
      alert(`Failed to approve client: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRejectClient = async (registrationId: string) => {
    const reason = prompt('Please provide a reason for rejection:')
    if (!reason) return

    try {
      const response = await fetch('/api/admin/reject-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ registrationId, reason })
      })

      if (!response.ok) {
        throw new Error('Failed to reject client')
      }

      alert('Client rejected successfully!')
    } catch (error) {
      console.error('Error rejecting client:', error)
      alert('Failed to reject client. Please try again.')
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user || !profile) {
    return null
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.stats.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.stats.totalProperties.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+8% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Work Orders</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.stats.activeWorkOrders}</div>
            <p className="text-xs text-muted-foreground">+3 new today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(mockData.stats.monthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">+15% from last month</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
            <CardDescription>Revenue trends over the last 5 months</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={mockData.chartData.revenue} width={400} height={250} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Work Orders Trend</CardTitle>
            <CardDescription>Daily work order activity</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart data={mockData.chartData.workOrdersTrend} width={400} height={250} color="#6366f1" />
          </CardContent>
        </Card>
      </div>

      {/* Work Orders Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Work Orders</CardTitle>
            <CardDescription>Latest work order activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockData.recentWorkOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{order.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {order.property} • {order.client}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Due: {formatDate(order.dueDate)}
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <Badge className={getStatusColor(order.status)}>
                      {order.status.replace('-', ' ')}
                    </Badge>
                    <Badge className={getPriorityColor(order.priority)}>
                      {order.priority}
                    </Badge>
                    <div className="font-medium">{formatCurrency(order.estimatedCost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Work Order Status</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent>
            <PieChart data={mockData.chartData.statusDistribution} width={300} height={250} />
          </CardContent>
        </Card>
      </div>
    </div>
  )

  return (
    <div className="p-6">
            {activeSection === 'dashboard' && renderDashboard()}
            {activeSection === 'users' && (
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage system users and permissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">User management interface coming soon...</p>
                </CardContent>
              </Card>
            )}
            {activeSection === 'clients' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Client Management</h2>
                    <p className="text-gray-600">Review and approve client registrations</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setActiveSection('generate-link')}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Generate Registration Link
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Pending</p>
                          <p className="text-2xl font-bold">
                            {clientRegistrations.filter(r => r.status === 'pending').length}
                          </p>
                        </div>
                        <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-yellow-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Approved</p>
                          <p className="text-2xl font-bold">
                            {clientRegistrations.filter(r => r.status === 'approved').length}
                          </p>
                        </div>
                        <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Total</p>
                          <p className="text-2xl font-bold">
                            {clientRegistrations.length}
                          </p>
                        </div>
                        <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Registrations */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Client Registrations</CardTitle>
                    <CardDescription>Latest client registration requests</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {clientRegistrations.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-gray-500">No client registrations found</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {clientRegistrations.slice(0, 10).map((registration) => (
                          <div key={registration.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-1 flex-1">
                              <div className="font-medium">{registration.companyName || registration.clientName}</div>
                              <div className="text-sm text-muted-foreground">
                                {registration.email} • {registration.contactPerson}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {registration.businessType} • {registration.numberOfProperties} properties
                              </div>
                              <div className="text-sm text-gray-500">
                                Submitted: {new Date(registration.submittedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right space-y-2">
                              <Badge 
                                className={
                                  registration.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  registration.status === 'approved' ? 'bg-green-100 text-green-800' :
                                  'bg-red-100 text-red-800'
                                }
                              >
                                {registration.status}
                              </Badge>
                              {registration.status === 'pending' && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleApproveClient(registration.id)}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRejectClient(registration.id)}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            {activeSection === 'generate-link' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    onClick={() => setActiveSection('clients')}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Client Management
                  </Button>
                  <div>
                    <h2 className="text-2xl font-bold">Generate Registration Link</h2>
                    <p className="text-gray-600">Create and send registration links to new clients</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <LinkIcon className="h-5 w-5" />
                        Generate New Link
                      </CardTitle>
                      <CardDescription>
                        Create a personalized registration link for a new client
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="clientEmail">Client Email *</Label>
                        <Input
                          id="clientEmail"
                          type="email"
                          placeholder="client@company.com"
                          value={linkFormData.clientEmail}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="clientName">Client Name/Company *</Label>
                        <Input
                          id="clientName"
                          placeholder="John Smith - Acme Property Management"
                          value={linkFormData.clientName}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkFormData(prev => ({ ...prev, clientName: e.target.value }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="expirationDays">Link Expiration (Days)</Label>
                        <Input
                          id="expirationDays"
                          type="number"
                          min="1"
                          max="30"
                          value={linkFormData.expirationDays}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkFormData(prev => ({ ...prev, expirationDays: e.target.value }))}
                        />
                      </div>

                      <Button 
                        className="w-full"
                        onClick={handleGenerateLink}
                        disabled={isGenerating}
                      >
                        {isGenerating ? 'Generating...' : 'Generate Registration Link'}
                      </Button>

                      {/* Generated Link Display */}
                      {generatedLink && (
                        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <h4 className="font-medium text-green-800 mb-2">Registration Link Generated!</h4>
                          <div className="space-y-3">
                            <div className="p-3 bg-white border border-green-200 rounded text-sm font-mono break-all">
                              {generatedLink}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(generatedLink)}
                              >
                                Copy Link
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => shareViaEmail(generatedLink)}
                              >
                                Send Email
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => shareViaWhatsApp(generatedLink)}
                              >
                                WhatsApp
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(generatedLink, '_blank')}
                              >
                                Open Link
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Generated Links</CardTitle>
                      <CardDescription>
                        Track all registration links you've created
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {generatedLinks.length === 0 ? (
                          <p className="text-gray-500 text-center py-4">No links generated yet</p>
                        ) : (
                          generatedLinks.map((link) => (
                            <div key={link.id} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <h3 className="font-medium">{link.clientName}</h3>
                                  <p className="text-sm text-gray-600">{link.clientEmail}</p>
                                  <p className="text-sm text-gray-500">
                                    Created: {new Date(link.createdAt).toLocaleDateString()}
                                  </p>
                                  <p className="text-xs text-gray-400 font-mono break-all">
                                    {link.registrationUrl}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <Badge className="bg-green-100 text-green-800">
                                    {link.status}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => copyToClipboard(link.registrationUrl)}
                                  >
                                    Copy
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            {activeSection === 'properties' && (
              <Card>
                <CardHeader>
                  <CardTitle>Property Management</CardTitle>
                  <CardDescription>Manage client properties and locations</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Property management interface coming soon...</p>
                </CardContent>
              </Card>
            )}
            {activeSection === 'workorders' && (
              <Card>
                <CardHeader>
                  <CardTitle>Work Order Management</CardTitle>
                  <CardDescription>Manage and track all work orders</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Work order management interface coming soon...</p>
                </CardContent>
              </Card>
            )}
            {activeSection === 'reports' && (
              <Card>
                <CardHeader>
                  <CardTitle>Reports & Analytics</CardTitle>
                  <CardDescription>Generate reports and view analytics</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Reports interface coming soon...</p>
                </CardContent>
              </Card>
            )}
            {activeSection === 'settings' && (
              <Card>
                <CardHeader>
                  <CardTitle>System Settings</CardTitle>
                  <CardDescription>Configure system settings and preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Settings interface coming soon...</p>
                </CardContent>
              </Card>
            )}
    </div>
  )
}
