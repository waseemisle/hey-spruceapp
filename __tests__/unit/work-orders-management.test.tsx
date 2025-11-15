import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { collection, query, getDocs, doc, updateDoc, addDoc, where } from 'firebase/firestore';
import WorkOrdersManagement from '@/app/admin-portal/work-orders/page';

jest.mock('@/components/admin-layout', () => {
  return function MockAdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'admin-uid' },
  },
}));

jest.mock('@/lib/notifications', () => ({
  notifyClientOfWorkOrderApproval: jest.fn(),
  notifyBiddingOpportunity: jest.fn(),
  notifyClientOfInvoice: jest.fn(),
  notifyScheduledService: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDoc: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Work Orders Management - Unit Tests', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
  const mockUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;
  const mockAddDoc = addDoc as jest.MockedFunction<typeof addDoc>;

  const mockWorkOrders = [
    {
      id: 'wo1',
      workOrderNumber: 'WO-001',
      clientId: 'client1',
      clientName: 'John Doe',
      clientEmail: 'john@test.com',
      locationId: 'loc1',
      locationName: 'Main Office',
      title: 'Fix Leak',
      description: 'Fix leaking pipe',
      category: 'Plumbing',
      priority: 'high',
      status: 'pending',
      images: [],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGetDocs.mockResolvedValue({
      docs: mockWorkOrders.map(wo => ({
        id: wo.id,
        data: () => wo,
      })),
    } as any);
  });

  it('renders work orders page', async () => {
    render(<WorkOrdersManagement />);
    
    await waitFor(() => {
      expect(screen.getByText(/work orders/i)).toBeInTheDocument();
    });
  });

  it('displays work orders list', async () => {
    render(<WorkOrdersManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Fix Leak')).toBeInTheDocument();
      expect(screen.getByText('WO-001')).toBeInTheDocument();
    });
  });

  it('approves a pending work order', async () => {
    const user = userEvent.setup();
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    
    render(<WorkOrdersManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Fix Leak')).toBeInTheDocument();
    });

    const approveButton = screen.getByText('Approve');
    await user.click(approveButton);
    
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'approved',
        })
      );
    });
  });

  it('shares work order for bidding', async () => {
    const user = userEvent.setup();
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'sub1', data: () => ({ fullName: 'Sub Contractor', status: 'approved' }) }],
    } as any);
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    
    render(<WorkOrdersManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Fix Leak')).toBeInTheDocument();
    });

    const shareButton = screen.getByText(/share for bidding/i);
    await user.click(shareButton);
    
    await waitFor(() => {
      expect(screen.getByText(/share for bidding/i)).toBeInTheDocument();
    });
  });

  it('filters work orders by status', async () => {
    const user = userEvent.setup();
    render(<WorkOrdersManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Fix Leak')).toBeInTheDocument();
    });

    const pendingFilter = screen.getByText(/pending/i);
    await user.click(pendingFilter);
    
    await waitFor(() => {
      expect(screen.getByText('Fix Leak')).toBeInTheDocument();
    });
  });
});

