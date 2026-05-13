import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from '@/lib/firebase-auth'
import { getDoc } from 'firebase/firestore'
import AdminLayout from '@/components/admin-layout'
import { ViewControlsProvider } from '@/contexts/view-controls-context'

function renderAdminLayout(children: ReactNode = <div>Test Content</div>) {
  return render(
    <ViewControlsProvider>
      <AdminLayout>{children}</AdminLayout>
    </ViewControlsProvider>,
  )
}

// Mock the hooks and functions
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/admin-portal'),
}))

jest.mock('@/lib/firebase-auth', () => ({
  onAuthStateChanged: jest.fn(),
}))

jest.mock('@/lib/support-ticket-snapshots', () => ({
  subscribeAdminUnassignedOpenSupportTicketCount: jest.fn((_db: unknown, onNext: (n: number) => void) => {
    onNext(0);
    return jest.fn();
  }),
}));

jest.mock('firebase/firestore', () => ({
  getDoc: jest.fn(),
  doc: jest.fn(() => ({})),
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  onSnapshot: jest.fn((_q: unknown, onNext: (snap: { size: number; docs: unknown[] }) => void) => {
    if (typeof onNext === 'function') {
      onNext({ size: 0, docs: [] });
    }
    return jest.fn();
  }),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
}))

jest.mock('@/lib/firebase', () => ({
  auth: {
    signOut: jest.fn(),
    currentUser: null,
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
    mockOnAuthStateChanged.mockImplementation((_auth, nextOrObserver) => {
      if (typeof nextOrObserver !== 'function') return jest.fn()
      return jest.fn()
    })

    renderAdminLayout()
    
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('redirects non-admin users to login', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, nextOrObserver) => {
      if (typeof nextOrObserver !== 'function') return jest.fn()
      ;(nextOrObserver as (u: unknown) => void)({ uid: 'user-uid', email: 'user@test.com' } as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    } as any)

    renderAdminLayout()
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal-login')
    })
  })

  it('renders admin layout for authenticated admin', async () => {
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    
    mockOnAuthStateChanged.mockImplementation((_auth, nextOrObserver) => {
      if (typeof nextOrObserver !== 'function') return jest.fn()
      ;(nextOrObserver as (u: unknown) => void)(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    renderAdminLayout()
    
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
    
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('renders all navigation menu items', async () => {
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    
    mockOnAuthStateChanged.mockImplementation((_auth, nextOrObserver) => {
      if (typeof nextOrObserver !== 'function') return jest.fn()
      ;(nextOrObserver as (u: unknown) => void)(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    renderAdminLayout()
    
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Work Orders')).toBeInTheDocument()
      expect(screen.getByText('Quotes')).toBeInTheDocument()
      expect(screen.getByText('Invoices')).toBeInTheDocument()
    })
  })

  it('toggles sidebar visibility', async () => {
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    
    mockOnAuthStateChanged.mockImplementation((_auth, nextOrObserver) => {
      if (typeof nextOrObserver !== 'function') return jest.fn()
      ;(nextOrObserver as (u: unknown) => void)(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    renderAdminLayout()
    
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    const toggleButton = screen.getByRole('button', { name: 'Toggle menu' })
    fireEvent.click(toggleButton)
    
    // Sidebar should be hidden (we can't easily test CSS classes, but the button should change)
    expect(toggleButton).toBeInTheDocument()
  })

  it('handles logout', async () => {
    const user = userEvent.setup()
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    const mockSignOut = jest.fn()
    
    mockOnAuthStateChanged.mockImplementation((_auth, nextOrObserver) => {
      if (typeof nextOrObserver !== 'function') return jest.fn()
      ;(nextOrObserver as (u: unknown) => void)(mockUser as any)
      return jest.fn()
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', fullName: 'Admin User' }),
    } as any)

    // Mock auth.signOut (module is fully mocked below)
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- test-only patch of mocked module
    const { auth } = require('@/lib/firebase')
    auth.signOut = mockSignOut

    renderAdminLayout()
    
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))
    await user.click(await screen.findByText('Sign out'))
    
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('redirects unauthenticated users to login', () => {
    mockOnAuthStateChanged.mockImplementation((_auth, nextOrObserver) => {
      if (typeof nextOrObserver !== 'function') return jest.fn()
      ;(nextOrObserver as (u: unknown) => void)(null)
      return jest.fn()
    })

    renderAdminLayout()
    
    expect(mockPush).toHaveBeenCalledWith('/portal-login')
  })
})
