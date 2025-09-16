'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { formatCurrency, formatDate, getStatusColor, getPriorityColor } from '@/lib/utils'
import BarChart from '@/components/charts/BarChart'
import LineChart from '@/components/charts/LineChart'
import PieChart from '@/components/charts/PieChart'
import { 
  Building2, 
  Wrench, 
  DollarSign, 
  TrendingUp, 
  Plus,
  Search,
  Filter,
  Settings,
  Home,
  FileText,
  Calendar,
  Bell,
  Clock
} from 'lucide-react'

// Mock data - in real app, this would come from Supabase
const mockData = {
  clientInfo: {
    name: 'Acme Corporation',
    email: 'contact@acmecorp.com',
    phone: '+1 (555) 123-4567',
    totalProperties: 12,
    activeWorkOrders: 8,
    monthlySpend: 45000
  },
  properties: [
    {
      id: 'prop-001',
      name: 'Downtown Office Complex',
      address: '123 Main St, Downtown, NY 10001',
      type: 'Office Building',
      workOrders: 3,
      lastMaintenance: '2024-01-10'
    },
    {
      id: 'prop-002',
      name: 'Warehouse District A',
      address: '456 Industrial Blvd, Warehouse District, NY 10002',
      type: 'Warehouse',
      workOrders: 2,
      lastMaintenance: '2024-01-08'
    },
    {
      id: 'prop-003',
      name: 'Retail Plaza',
      address: '789 Shopping Ave, Retail District, NY 10003',
      type: 'Retail',
      workOrders: 1,
      lastMaintenance: '2024-01-05'
    }
  ],
  workOrders: [
    {
      id: 'WO-001',
      title: 'HVAC System Maintenance',
      property: 'Downtown Office Complex',
      description: 'Quarterly HVAC system inspection and maintenance',
      status: 'in-progress',
      priority: 'medium',
      estimatedCost: 2500,
      actualCost: 0,
      dueDate: '2024-01-15',
      assignedTo: 'ABC HVAC Services',
      createdAt: '2024-01-01'
    },
    {
      id: 'WO-002',
      title: 'Plumbing Repair - Floor 3',
      property: 'Downtown Office Complex',
      description: 'Fix leaking pipe in restroom on floor 3',
      status: 'pending',
      priority: 'high',
      estimatedCost: 1200,
      actualCost: 0,
      dueDate: '2024-01-20',
      assignedTo: 'Quick Fix Plumbing',
      createdAt: '2024-01-02'
    },
    {
      id: 'WO-003',
      title: 'Landscaping Service',
      property: 'Retail Plaza',
      description: 'Weekly landscaping and maintenance',
      status: 'completed',
      priority: 'low',
      estimatedCost: 800,
      actualCost: 750,
      dueDate: '2024-01-10',
      assignedTo: 'Green Thumb Landscaping',
      createdAt: '2024-01-01'
    }
  ],
  chartData: {
    monthlySpend: [
      { label: 'Jan', value: 42000, color: '#6366f1' },
      { label: 'Feb', value: 38000, color: '#6366f1' },
      { label: 'Mar', value: 45000, color: '#6366f1' },
      { label: 'Apr', value: 52000, color: '#6366f1' },
      { label: 'May', value: 45000, color: '#6366f1' }
    ],
    workOrderTrend: [
      { date: '2024-01-01', value: 12 },
      { date: '2024-01-02', value: 15 },
      { date: '2024-01-03', value: 13 },
      { date: '2024-01-04', value: 18 },
      { date: '2024-01-05', value: 16 },
      { date: '2024-01-06', value: 20 },
      { date: '2024-01-07', value: 17 }
    ],
    workOrderStatus: [
      { label: 'Completed', value: 45, color: '#10b981' },
      { label: 'In Progress', value: 30, color: '#f59e0b' },
      { label: 'Pending', value: 25, color: '#6b7280' }
    ]
  }
}


export default function ClientPortal() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [activeSection, setActiveSection] = useState('dashboard')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.push('/portal-login')
      return
    }

    if (profile && profile.role !== 'client') {
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.clientInfo.totalProperties}</div>
            <p className="text-xs text-muted-foreground">Managed locations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Work Orders</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockData.clientInfo.activeWorkOrders}</div>
            <p className="text-xs text-muted-foreground">Currently in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(mockData.clientInfo.monthlySpend)}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2.4h</div>
            <p className="text-xs text-muted-foreground">Service response</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Spending</CardTitle>
            <CardDescription>Maintenance costs over the last 5 months</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={mockData.chartData.monthlySpend} width={400} height={250} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Work Order Activity</CardTitle>
            <CardDescription>Daily work order trends</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart data={mockData.chartData.workOrderTrend} width={400} height={250} color="#6366f1" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Work Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Work Orders</CardTitle>
          <CardDescription>Latest maintenance requests and updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockData.workOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                <div className="space-y-1">
                  <div className="font-medium">{order.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {order.property} • {order.assignedTo}
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
                  <div className="font-medium">
                    {order.actualCost > 0 ? formatCurrency(order.actualCost) : formatCurrency(order.estimatedCost)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderProperties = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Properties</h2>
          <p className="text-gray-600">Manage your property portfolio</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Property
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockData.properties.map((property) => (
          <Card key={property.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">{property.name}</CardTitle>
              <CardDescription>{property.type}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-sm text-gray-600">{property.address}</div>
                <div className="flex justify-between text-sm">
                  <span>Active Work Orders:</span>
                  <span className="font-medium">{property.workOrders}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Last Maintenance:</span>
                  <span className="font-medium">{formatDate(property.lastMaintenance)}</span>
                </div>
                <Button variant="outline" className="w-full mt-4">
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )

  const renderWorkOrders = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Work Orders</h2>
          <p className="text-gray-600">Track maintenance requests and progress</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
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
        {mockData.workOrders.map((order) => (
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
                  <div className="text-sm text-gray-500">
                    <div>Property: {order.property}</div>
                    <div>Assigned to: {order.assignedTo}</div>
                    <div>Due: {formatDate(order.dueDate)}</div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="font-semibold text-lg">
                    {order.actualCost > 0 ? formatCurrency(order.actualCost) : formatCurrency(order.estimatedCost)}
                  </div>
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
            {activeSection === 'dashboard' && renderDashboard()}
            {activeSection === 'properties' && renderProperties()}
            {activeSection === 'workorders' && renderWorkOrders()}
            {activeSection === 'billing' && (
              <Card>
                <CardHeader>
                  <CardTitle>Billing & Invoices</CardTitle>
                  <CardDescription>View billing history and manage payments</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Billing interface coming soon...</p>
                </CardContent>
              </Card>
            )}
            {activeSection === 'reports' && (
              <Card>
                <CardHeader>
                  <CardTitle>Reports</CardTitle>
                  <CardDescription>Generate property and maintenance reports</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Reports interface coming soon...</p>
                </CardContent>
              </Card>
            )}
            {activeSection === 'notifications' && (
              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>Manage your notification preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Notifications interface coming soon...</p>
                </CardContent>
              </Card>
            )}
            {activeSection === 'settings' && (
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                  <CardDescription>Manage your account preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">Settings interface coming soon...</p>
                </CardContent>
              </Card>
            )}
    </div>
  )
}
