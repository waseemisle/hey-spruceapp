'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import Logo from '@/components/ui/logo'
import WithRoleProtection from '@/components/auth/withRoleProtection'
import { 
  Users, 
  Building2, 
  Wrench, 
  DollarSign, 
  TrendingUp, 
  Settings,
  LogOut,
  Menu,
  X,
  FileText,
  Receipt,
  Calendar
} from 'lucide-react'

const sidebarItems = [
  { id: 'dashboard', label: 'Dashboard', icon: TrendingUp, path: '/admin-portal' },
  { id: 'register-admin', label: 'Register New Admin', icon: Users, path: '/admin-portal/register-admin' },
  { id: 'clients', label: 'Clients', icon: Users, path: '/admin-portal/clients' },
  { id: 'subcontractors', label: 'Subcontractors', icon: Users, path: '/admin-portal/subcontractors' },
  { id: 'categories', label: 'Categories', icon: Settings, path: '/admin-portal/categories' },
  { id: 'locations', label: 'Locations', icon: Building2, path: '/admin-portal/locations' },
  { id: 'workorders', label: 'Work Orders', icon: Wrench, path: '/admin-portal/workorders' },
  { id: 'quotes', label: 'Quotes', icon: FileText, path: '/admin-portal/quotes' },
  { id: 'invoices', label: 'Invoices', icon: Receipt, path: '/admin-portal/invoices' },
  { id: 'scheduled-invoices', label: 'Scheduled Invoices', icon: Calendar, path: '/admin-portal/scheduled-invoices' }
]

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <WithRoleProtection 
      allowedRoles={['admin']}
      fallbackMessage="This admin portal is only accessible to administrators."
    >
      <AdminPortalContent>
        {children}
      </AdminPortalContent>
    </WithRoleProtection>
  )
}

function AdminPortalContent({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/portal-login')
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleNavigation = (item: any) => {
    if (item.path === '/admin-portal') {
      router.push('/admin-portal')
    } else {
      router.push(item.path)
    }
    setSidebarOpen(false)
  }

  const isActive = (item: any) => {
    if (item.path === '/admin-portal') {
      return pathname === '/admin-portal'
    }
    return pathname === item.path
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-3">
              <Logo size="lg" showText={false} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Spruce App</h1>
                <p className="text-sm text-gray-600">Admin Portal</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-medium">{profile?.fullName}</div>
              <div className="text-sm text-gray-600">Administrator</div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col h-full">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900">Navigation</h2>
            </div>
            
            <nav className="flex-1 px-4 pb-4">
              <div className="space-y-2">
                {sidebarItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigation(item)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors
                        text-gray-700 hover:bg-gray-100
                      `}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-medium">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-0">
          {children}
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
