'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { ActiveSectionContext } from '@/hooks/useActiveSection'
import Logo from '@/components/ui/logo'
import { 
  Wrench, 
  DollarSign, 
  TrendingUp, 
  FileText,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Calendar,
  Star
} from 'lucide-react'

const sidebarItems = [
  { id: 'dashboard', label: 'Dashboard', icon: TrendingUp, path: '/subcontractor-portal' },
  { id: 'skills', label: 'Skills', icon: Settings, path: '/subcontractor-portal/skills' },
  { id: 'open-for-bidding', label: 'Open for Bidding', icon: DollarSign, path: '/subcontractor-portal/bidding' },
  { id: 'my-assigned', label: 'My Assigned', icon: Wrench, path: '/subcontractor-portal/assigned' }
]


export default function SubcontractorPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('dashboard')

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/portal-login')
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleNavigation = (item: any) => {
    setActiveSection(item.id)
    if (item.path === '/subcontractor-portal') {
      router.push('/subcontractor-portal')
    } else {
      router.push(item.path)
    }
    setSidebarOpen(false)
  }

  const isActive = (item: any) => {
    return activeSection === item.id
  }

  return (
    <ActiveSectionContext.Provider value={{ activeSection, setActiveSection }}>
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
                  <p className="text-sm text-gray-600">Subcontractor Portal</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-medium">{profile?.fullName}</div>
                <div className="text-sm text-gray-600">Subcontractor</div>
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
                          ${isActive(item) 
                            ? 'bg-green-600 text-white' 
                            : 'text-gray-700 hover:bg-gray-100'
                          }
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
    </ActiveSectionContext.Provider>
  )
}
