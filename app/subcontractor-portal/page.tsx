'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { useActiveSection } from '@/hooks/useActiveSection'
import { formatCurrency, formatDate, getStatusColor, getPriorityColor } from '@/lib/utils'
import BarChart from '@/components/charts/BarChart'
import LineChart from '@/components/charts/LineChart'
import PieChart from '@/components/charts/PieChart'
import { 
  Wrench, 
  DollarSign, 
  TrendingUp, 
  Plus,
  Search,
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Calendar,
  Star,
  Settings
} from 'lucide-react'

// Mock data - in real app, this would come from Supabase
const mockData = {
  contractorInfo: {
    name: 'ABC HVAC Services',
    email: 'contact@abchvac.com',
    phone: '+1 (555) 987-6543',
    rating: 4.8,
    completedJobs: 156,
    activeJobs: 8,
    monthlyEarnings: 45000,
    specialties: ['HVAC', 'Plumbing', 'Electrical']
  },
  assignedWorkOrders: [
    {
      id: 'WO-001',
      title: 'HVAC System Maintenance',
      property: 'Downtown Office Complex',
      client: 'Acme Corporation',
      description: 'Quarterly HVAC system inspection and maintenance',
      status: 'in-progress',
      priority: 'medium',
      estimatedCost: 2500,
      proposedAmount: 2300,
      dueDate: '2024-01-15',
      createdAt: '2024-01-01',
      location: '123 Main St, Downtown, NY 10001'
    },
    {
      id: 'WO-002',
      title: 'Emergency AC Repair',
      property: 'Retail Plaza',
      client: 'Tech Solutions Inc',
      description: 'AC unit not cooling properly on floor 2',
      status: 'pending',
      priority: 'high',
      estimatedCost: 1200,
      proposedAmount: 1100,
      dueDate: '2024-01-12',
      createdAt: '2024-01-02',
      location: '789 Shopping Ave, Retail District, NY 10003'
    },
    {
      id: 'WO-003',
      title: 'Heating System Check',
      property: 'Warehouse District A',
      client: 'Housing Authority',
      description: 'Pre-winter heating system inspection',
      status: 'completed',
      priority: 'low',
      estimatedCost: 800,
      proposedAmount: 750,
      actualCost: 720,
      dueDate: '2024-01-10',
      createdAt: '2024-01-01',
      location: '456 Industrial Blvd, Warehouse District, NY 10002'
    }
  ],
  proposals: [
    {
      id: 'PROP-001',
      workOrderId: 'WO-004',
      title: 'Plumbing System Upgrade',
      client: 'Office Complex B',
      proposedAmount: 3500,
      status: 'pending',
      submittedAt: '2024-01-05',
      description: 'Upgrade plumbing system for better efficiency'
    },
    {
      id: 'PROP-002',
      workOrderId: 'WO-005',
      title: 'Electrical Panel Maintenance',
      client: 'Shopping Center',
      proposedAmount: 1800,
      status: 'approved',
      submittedAt: '2024-01-03',
      description: 'Annual electrical panel inspection and maintenance'
    }
  ],
  chartData: {
    monthlyEarnings: [
      { label: 'Jan', value: 42000, color: '#10b981' },
      { label: 'Feb', value: 38000, color: '#10b981' },
      { label: 'Mar', value: 45000, color: '#10b981' },
      { label: 'Apr', value: 52000, color: '#10b981' },
      { label: 'May', value: 45000, color: '#10b981' }
    ],
    jobCompletionTrend: [
      { date: '2024-01-01', value: 12 },
      { date: '2024-01-02', value: 15 },
      { date: '2024-01-03', value: 13 },
      { date: '2024-01-04', value: 18 },
      { date: '2024-01-05', value: 16 },
      { date: '2024-01-06', value: 20 },
      { date: '2024-01-07', value: 17 }
    ],
    jobStatus: [
      { label: 'Completed', value: 65, color: '#10b981' },
      { label: 'In Progress', value: 25, color: '#f59e0b' },
      { label: 'Pending', value: 10, color: '#6b7280' }
    ]
  }
}


export default function SubcontractorPortal() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const { activeSection } = useActiveSection()
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.push('/portal-login')
      return
    }

    if (profile && profile.role !== 'subcontractor') {
      router.push('/portal-login')
      return
    }
  }, [user, profile, loading, router])


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
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Welcome back, {profile?.fullName}!</h2>
        <p className="text-green-100">Manage your skills, view bidding opportunities, and track your assigned work orders.</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/subcontractor-portal/skills')}>
          <CardContent className="p-6 text-center">
            <Settings className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h3 className="font-semibold">Manage Skills</h3>
            <p className="text-sm text-gray-600">Add or update your professional skills</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/subcontractor-portal/bidding')}>
          <CardContent className="p-6 text-center">
            <DollarSign className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <h3 className="font-semibold">Open for Bidding</h3>
            <p className="text-sm text-gray-600">Submit quotes for work orders</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/subcontractor-portal/assigned')}>
          <CardContent className="p-6 text-center">
            <Wrench className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <h3 className="font-semibold">My Assigned Work</h3>
            <p className="text-sm text-gray-600">Track and complete assigned work orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.contractorInfo.activeJobs}</div>
            <p className="text-xs text-muted-foreground">Currently assigned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Jobs</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.contractorInfo.completedJobs}</div>
            <p className="text-xs text-muted-foreground">Total completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(mockData.contractorInfo.monthlyEarnings)}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rating</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.contractorInfo.rating}</div>
            <p className="text-xs text-muted-foreground">Customer rating</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Earnings</CardTitle>
            <CardDescription>Earnings over the last 5 months</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={mockData.chartData.monthlyEarnings} width={400} height={250} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Completion Trend</CardTitle>
            <CardDescription>Daily job completion activity</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart data={mockData.chartData.jobCompletionTrend} width={400} height={250} color="#10b981" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Work Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Work Orders</CardTitle>
            <CardDescription>Latest assigned work orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockData.assignedWorkOrders.map((order) => (
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
                    <div className="font-medium">{formatCurrency(order.proposedAmount)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Status</CardTitle>
            <CardDescription>Current job distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <PieChart data={mockData.chartData.jobStatus} width={300} height={250} />
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderWorkOrders = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Work Orders</h2>
          <p className="text-gray-600">Manage your assigned work orders</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search work orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Button variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          Filter
        </Button>
      </div>

      {/* Work Orders List */}
      <div className="space-y-4">
        {mockData.assignedWorkOrders.map((order) => (
          <Card key={order.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{order.title}</h3>
                    <Badge className={getStatusColor(order.status)}>
                      {order.status.replace('-', ' ')}
                    </Badge>
                    <Badge className={getPriorityColor(order.priority)}>
                      {order.priority}
                    </Badge>
                  </div>
                  <p className="text-gray-600">{order.description}</p>
                  <div className="text-sm text-gray-500 space-y-1">
                    <div>Client: {order.client}</div>
                    <div>Property: {order.property}</div>
                    <div>Location: {order.location}</div>
                    <div>Due: {formatDate(order.dueDate)}</div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="font-semibold text-lg">{formatCurrency(order.proposedAmount)}</div>
                  <div className="space-x-2">
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                    {order.status === 'pending' && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700">
                        Accept Job
                      </Button>
                    )}
                    {order.status === 'in-progress' && (
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                        Mark Complete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )

  const renderProposals = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Proposals</h2>
          <p className="text-gray-600">Manage your submitted proposals</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Submit Proposal
        </Button>
      </div>

      {/* Proposals List */}
      <div className="space-y-4">
        {mockData.proposals.map((proposal) => (
          <Card key={proposal.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{proposal.title}</h3>
                    <Badge className={getStatusColor(proposal.status)}>
                      {proposal.status}
                    </Badge>
                  </div>
                  <p className="text-gray-600">{proposal.description}</p>
                  <div className="text-sm text-gray-500 space-y-1">
                    <div>Client: {proposal.client}</div>
                    <div>Work Order: {proposal.workOrderId}</div>
                    <div>Submitted: {formatDate(proposal.submittedAt)}</div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="font-semibold text-lg">{formatCurrency(proposal.proposedAmount)}</div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-6">
      {renderDashboard()}
    </div>
  )
}
