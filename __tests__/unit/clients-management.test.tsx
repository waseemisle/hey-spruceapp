import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { collection, query, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import ClientsManagement from '@/app/admin-portal/clients/page';

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

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
  where: jest.fn(),
  deleteDoc: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Clients Management - Unit Tests', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
  const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
  const mockUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;

  const mockClients = [
    {
      uid: 'client1',
      email: 'john@test.com',
      fullName: 'John Doe',
      phone: '555-1234',
      status: 'pending',
      assignedLocations: ['loc1'],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGetDocs.mockResolvedValue({
      docs: mockClients.map(client => ({
        id: client.uid,
        data: () => client,
      })),
    } as any);
  });

  it('renders clients page', async () => {
    render(<ClientsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Clients')).toBeInTheDocument();
    });
  });

  it('displays clients list', async () => {
    render(<ClientsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@test.com')).toBeInTheDocument();
    });
  });

  it('approves a pending client', async () => {
    const user = userEvent.setup();
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ assignedLocations: ['loc1'], email: 'john@test.com' }),
      } as any)
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ fullName: 'Admin User' }),
      } as any);
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    
    render(<ClientsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const approveButton = screen.getByText('Approve');
    await user.click(approveButton);
    
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  it('rejects a pending client', async () => {
    const user = userEvent.setup();
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    
    render(<ClientsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const rejectButton = screen.getByText('Reject');
    await user.click(rejectButton);
    
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  it('filters clients by status', async () => {
    const user = userEvent.setup();
    render(<ClientsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const pendingFilter = screen.getByText(/pending/i);
    await user.click(pendingFilter);
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('searches clients', async () => {
    const user = userEvent.setup();
    render(<ClientsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search clients/i);
    await user.type(searchInput, 'John');
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });
});

