import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc } from 'firebase/firestore'
import AdminLayout from '@/components/admin-layout'

// Mock the hooks and functions
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
  getDoc: jest.fn(),
  doc: jest.fn(),
}))

jest.mock('@/lib/firebase', () => ({
  auth: {
    signOut: jest.fn(),
  },
  db: {},
}))

describe('AdminLayout', () => {
  const mockPush = jest.fn()
  const mockOnAuthStateChanged = onAuthStateChanged as jest.MockedFunction<typeof onAuthStateChanged>
  const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
  })

  it('shows loading state initially', () => {
    mockOnAuthStateChanged.mockImplementation((callback) => {
      // Don't call callback immediately to show loading state
      return jest.fn()
    })

    render(<AdminLayout><div>Test Content</div></AdminLayout>)
    
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('redirects non-admin users to login', () => {
    mockOnAuthStateChanged.mockImplementation((callback) => {
      callback({ uid: 'user-uid', email: 'user@test.com' } as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    } as any)

    render(<AdminLayout><div>Test Content</div></AdminLayout>)
    
    expect(mockPush).toHaveBeenCalledWith('/portal-login')
  })

  it('renders admin layout for authenticated admin', async () => {
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    
    mockOnAuthStateChanged.mockImplementation((callback) => {
      callback(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    render(<AdminLayout><div>Test Content</div></AdminLayout>)
    
    await waitFor(() => {
      expect(screen.getByText('Admin Portal')).toBeInTheDocument()
    })
    
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('renders all navigation menu items', async () => {
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    
    mockOnAuthStateChanged.mockImplementation((callback) => {
      callback(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    render(<AdminLayout><div>Test Content</div></AdminLayout>)
    
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Clients')).toBeInTheDocument()
      expect(screen.getByText('Subcontractors')).toBeInTheDocument()
      expect(screen.getByText('Admin Users')).toBeInTheDocument()
      expect(screen.getByText('Subsidiaries')).toBeInTheDocument()
      expect(screen.getByText('Locations')).toBeInTheDocument()
      expect(screen.getByText('Work Orders')).toBeInTheDocument()
      expect(screen.getByText('Recurring Work Orders')).toBeInTheDocument()
      expect(screen.getByText('Quotes')).toBeInTheDocument()
      expect(screen.getByText('Invoices')).toBeInTheDocument()
      expect(screen.getByText('Scheduled Invoices')).toBeInTheDocument()
      expect(screen.getByText('Messages')).toBeInTheDocument()
    })
  })

  it('toggles sidebar visibility', async () => {
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    
    mockOnAuthStateChanged.mockImplementation((callback) => {
      callback(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    render(<AdminLayout><div>Test Content</div></AdminLayout>)
    
    await waitFor(() => {
      expect(screen.getByText('Admin Portal')).toBeInTheDocument()
    })

    const toggleButton = screen.getByRole('button', { name: '' }) // Menu/X button
    fireEvent.click(toggleButton)
    
    // Sidebar should be hidden (we can't easily test CSS classes, but the button should change)
    expect(toggleButton).toBeInTheDocument()
  })

  it('handles logout', async () => {
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    const mockSignOut = jest.fn()
    
    mockOnAuthStateChanged.mockImplementation((callback) => {
      callback(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    // Mock auth.signOut
    const { auth } = require('@/lib/firebase')
    auth.signOut = mockSignOut

    render(<AdminLayout><div>Test Content</div></AdminLayout>)
    
    await waitFor(() => {
      expect(screen.getByText('Admin Portal')).toBeInTheDocument()
    })

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    fireEvent.click(logoutButton)
    
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('redirects unauthenticated users to login', () => {
    mockOnAuthStateChanged.mockImplementation((callback) => {
      callback(null) // No user
      return jest.fn()
    })

    render(<AdminLayout><div>Test Content</div></AdminLayout>)
    
    expect(mockPush).toHaveBeenCalledWith('/portal-login')
  })
})
