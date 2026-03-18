import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { collection, query, getDocs, onSnapshot } from 'firebase/firestore'
import AdminDashboard from '@/app/admin-portal/page'

// Mock Firebase functions
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  where: jest.fn(),
  doc: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}))

jest.mock('@/lib/firebase', () => ({
  db: {},
}))

jest.mock('@/components/admin-layout', () => {
  const MockAdminLayout = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  )
  MockAdminLayout.displayName = 'MockAdminLayout'
  return MockAdminLayout
})

jest.mock('@/components/dashboard/dashboard-search-bar', () => {
  const MockDashboardSearchBar = () => <div data-testid="dashboard-search-bar" />
  MockDashboardSearchBar.displayName = 'MockDashboardSearchBar'
  return MockDashboardSearchBar
})

jest.mock('@/components/dashboard/work-orders-section', () => {
  const MockWorkOrdersSection = () => <div data-testid="work-orders-section" />
  MockWorkOrdersSection.displayName = 'MockWorkOrdersSection'
  return MockWorkOrdersSection
})

jest.mock('@/components/dashboard/proposals-section', () => {
  const MockProposalsSection = () => <div data-testid="proposals-section" />
  MockProposalsSection.displayName = 'MockProposalsSection'
  return MockProposalsSection
})

jest.mock('@/components/dashboard/invoices-section', () => {
  const MockInvoicesSection = () => <div data-testid="invoices-section" />
  MockInvoicesSection.displayName = 'MockInvoicesSection'
  return MockInvoicesSection
})

jest.mock('@/components/calendar/admin-calendar', () => {
  const MockAdminCalendar = () => <div data-testid="admin-calendar" />
  MockAdminCalendar.displayName = 'MockAdminCalendar'
  return MockAdminCalendar
})

jest.mock('@/lib/dashboard-utils', () => ({
  calculateWorkOrdersData: jest.fn().mockResolvedValue({
    workRequired: { total: 0, dispatchNotConfirmed: { urgent: 0, total: 0 }, declinedByProvider: { urgent: 0, total: 0 }, lateToArrive: { urgent: 0, total: 0 } },
    inProgress: { total: 0, partsOnOrder: { urgent: 0, total: 0 }, waitingForQuote: { urgent: 0, total: 0 }, unsatisfactory: 0 },
    awaitingAction: { total: 0, pendingConfirmation: 0, actionRequired: 0, myActionRequired: 0 },
  }),
  calculateProposalsData: jest.fn().mockResolvedValue({
    pendingApproval: { urgent: 0, total: 0 },
    onHold: 0,
    rejected: 0,
    approved: 0,
  }),
  calculateInvoicesData: jest.fn().mockResolvedValue({
    completedNotInvoiced: 0,
    openReviewed: { count: 0, amount: '0.00', mixedCurrency: false },
    onHold: { count: 0, amount: '0.00' },
    rejected: { count: 0, amount: '0.00' },
  }),
}))

describe('AdminDashboard', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>
  const mockOnSnapshot = onSnapshot as jest.MockedFunction<typeof onSnapshot>

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetDocs.mockResolvedValue({ docs: [], size: 0, forEach: jest.fn() } as any)
    mockOnSnapshot.mockReturnValue(jest.fn() as any)
  })

  it('renders dashboard title and description', async () => {
    render(<AdminDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Welcome to your GroundOps admin portal')).toBeInTheDocument()
    })
  })

  it('renders all main dashboard sections', async () => {
    render(<AdminDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('work-orders-section')).toBeInTheDocument()
      expect(screen.getByTestId('proposals-section')).toBeInTheDocument()
      expect(screen.getByTestId('invoices-section')).toBeInTheDocument()
      expect(screen.getByTestId('admin-calendar')).toBeInTheDocument()
    })
  })

  it('renders admin layout wrapper', async () => {
    render(<AdminDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
    })
  })

  it('renders company selector with All Companies default', async () => {
    render(<AdminDashboard />)

    await waitFor(() => {
      expect(screen.getByText('All Companies')).toBeInTheDocument()
    })
  })

  it('sets up real-time listeners on mount', async () => {
    render(<AdminDashboard />)

    await waitFor(() => {
      // onSnapshot is called for workOrders, quotes, and invoices collections
      expect(mockOnSnapshot).toHaveBeenCalledTimes(3)
    })
  })

  it('handles Firestore errors gracefully without crashing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGetDocs.mockRejectedValueOnce(new Error('Firebase error'))

    render(<AdminDashboard />)

    // Component should still render without throwing
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    consoleSpy.mockRestore()
  })
})
