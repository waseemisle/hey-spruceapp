import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { collection, query, getDocs, onSnapshot } from 'firebase/firestore'
import AdminDashboard from '@/app/admin-portal/page'

// Mock Firebase functions
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  where: jest.fn(),
}))

jest.mock('@/lib/firebase', () => ({
  db: {},
}))

jest.mock('@/components/admin-layout', () => {
  return function MockAdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>
  }
})

describe('AdminDashboard', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>
  const mockOnSnapshot = onSnapshot as jest.MockedFunction<typeof onSnapshot>
  const mockCollection = collection as jest.MockedFunction<typeof collection>
  const mockQuery = query as jest.MockedFunction<typeof query>
  const mockWhere = query as jest.MockedFunction<typeof query>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders dashboard with title and description', () => {
    mockGetDocs.mockResolvedValueOnce({ size: 0 } as any)
    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Welcome to your Hey Spruce admin portal')).toBeInTheDocument()
  })

  it('renders all stat cards', async () => {
    mockGetDocs.mockResolvedValue({ size: 0 } as any)
    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('Pending Client Approvals')).toBeInTheDocument()
      expect(screen.getByText('Pending Subcontractor Approvals')).toBeInTheDocument()
      expect(screen.getByText('Pending Location Approvals')).toBeInTheDocument()
      expect(screen.getByText('Pending Work Orders')).toBeInTheDocument()
      expect(screen.getByText('Total Invoices')).toBeInTheDocument()
      expect(screen.getByText('Total Revenue')).toBeInTheDocument()
    })
  })

  it('displays correct initial stats', async () => {
    mockGetDocs.mockResolvedValue({ size: 0 } as any)
    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument() // All stats should be 0 initially
      expect(screen.getByText('$0')).toBeInTheDocument() // Revenue should be $0
    })
  })

  it('fetches stats from correct collections', async () => {
    mockGetDocs.mockResolvedValue({ size: 0 } as any)
    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'clients')
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'subcontractors')
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'locations')
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'workOrders')
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'invoices')
    })
  })

  it('sets up real-time listeners for pending counts', async () => {
    mockGetDocs.mockResolvedValue({ size: 0 } as any)
    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(mockOnSnapshot).toHaveBeenCalledTimes(2) // Clients and subcontractors listeners
    })
  })

  it('calculates total revenue from paid invoices', async () => {
    const mockInvoicesSnapshot = {
      size: 2,
      forEach: (callback: (doc: any) => void) => {
        callback({
          data: () => ({
            status: 'paid',
            totalAmount: 1000,
          }),
        })
        callback({
          data: () => ({
            status: 'paid',
            totalAmount: 500,
          }),
        })
      },
    }

    mockGetDocs
      .mockResolvedValueOnce({ size: 0 } as any) // clients
      .mockResolvedValueOnce({ size: 0 } as any) // subcontractors
      .mockResolvedValueOnce({ size: 0 } as any) // locations
      .mockResolvedValueOnce({ size: 0 } as any) // workOrders
      .mockResolvedValueOnce(mockInvoicesSnapshot as any) // invoices

    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('$1,500')).toBeInTheDocument() // Total revenue
    })
  })

  it('renders quick actions section', async () => {
    mockGetDocs.mockResolvedValue({ size: 0 } as any)
    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument()
      expect(screen.getByText('• Review pending client and subcontractor registrations')).toBeInTheDocument()
      expect(screen.getByText('• Approve location requests from clients')).toBeInTheDocument()
      expect(screen.getByText('• Manage work orders and assign to subcontractors')).toBeInTheDocument()
      expect(screen.getByText('• Generate and send invoices with Stripe payment links')).toBeInTheDocument()
    })
  })

  it('handles errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    mockGetDocs.mockRejectedValueOnce(new Error('Firebase error'))
    mockOnSnapshot.mockReturnValue(jest.fn())

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching stats:', expect.any(Error))
    })

    consoleSpy.mockRestore()
  })

  it('updates stats in real-time', async () => {
    let snapshotCallback: (snapshot: any) => void
    
    mockGetDocs.mockResolvedValue({ size: 0 } as any)
    mockOnSnapshot.mockImplementation((query, callback) => {
      snapshotCallback = callback
      return jest.fn()
    })

    render(<AdminDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument()
    })

    // Simulate real-time update
    snapshotCallback({ size: 3 })
    
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })
})
