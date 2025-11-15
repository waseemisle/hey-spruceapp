import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { collection, query, getDocs, doc, updateDoc, addDoc, deleteDoc, where } from 'firebase/firestore';
import LocationsManagement from '@/app/admin-portal/locations/page';

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
  doc: jest.fn(),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Locations Management - Unit Tests', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
  const mockUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;
  const mockAddDoc = addDoc as jest.MockedFunction<typeof addDoc>;
  const mockDeleteDoc = deleteDoc as jest.MockedFunction<typeof deleteDoc>;

  const mockLocations = [
    {
      id: 'loc1',
      clientId: 'client1',
      clientName: 'John Doe',
      clientEmail: 'john@test.com',
      locationName: 'Main Office',
      address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'USA',
      },
      propertyType: 'Office',
      contactPerson: 'Jane Smith',
      contactPhone: '555-1234',
      status: 'pending',
    },
  ];

  const mockClients = [
    { id: 'client1', fullName: 'John Doe', email: 'john@test.com' },
  ];

  const mockCompanies = [
    { id: 'comp1', name: 'Test Company', clientId: 'client1' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGetDocs
      .mockResolvedValueOnce({
        docs: mockLocations.map(loc => ({
          id: loc.id,
          data: () => loc,
        })),
      } as any)
      .mockResolvedValueOnce({
        docs: mockClients.map(client => ({
          id: client.id,
          data: () => client,
        })),
      } as any)
      .mockResolvedValueOnce({
        docs: mockCompanies.map(comp => ({
          id: comp.id,
          data: () => comp,
        })),
      } as any);
  });

  it('renders locations page with title', async () => {
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Locations')).toBeInTheDocument();
    });
  });

  it('displays locations list', async () => {
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('filters locations by status', async () => {
    const user = userEvent.setup();
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const pendingButton = screen.getByText(/pending/i);
    await user.click(pendingButton);
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
  });

  it('searches locations by name', async () => {
    const user = userEvent.setup();
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search locations/i);
    await user.type(searchInput, 'Main');
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
  });

  it('opens create location modal', async () => {
    const user = userEvent.setup();
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Create Location')).toBeInTheDocument();
    });

    const createButton = screen.getByText('Create Location');
    await user.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create New Location')).toBeInTheDocument();
    });
  });

  it('approves a pending location', async () => {
    const user = userEvent.setup();
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
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

  it('rejects a pending location', async () => {
    const user = userEvent.setup();
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const rejectButton = screen.getByText('Reject');
    await user.click(rejectButton);
    
    await waitFor(() => {
      expect(screen.getByText('Reject Location')).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/rejection reason/i);
    await user.type(reasonInput, 'Invalid address');
    
    const confirmButton = screen.getByText('Reject Location');
    await user.click(confirmButton);
    
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  it('creates a new location', async () => {
    const user = userEvent.setup();
    mockAddDoc.mockResolvedValueOnce({ id: 'new-loc' } as any);
    
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Create Location')).toBeInTheDocument();
    });

    const createButton = screen.getByText('Create Location');
    await user.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create New Location')).toBeInTheDocument();
    });

    // Fill form
    const clientSelect = screen.getByLabelText(/select client/i);
    await user.selectOptions(clientSelect, 'client1');
    
    await waitFor(() => {
      const companySelect = screen.getByLabelText(/company/i);
      expect(companySelect).not.toBeDisabled();
    });

    const companySelect = screen.getByLabelText(/company/i);
    await user.selectOptions(companySelect, 'comp1');
    
    const locationNameInput = screen.getByLabelText(/location name/i);
    await user.type(locationNameInput, 'New Location');
    
    const streetInput = screen.getByLabelText(/street address/i);
    await user.type(streetInput, '456 Oak Ave');
    
    const cityInput = screen.getByLabelText(/city/i);
    await user.type(cityInput, 'Los Angeles');
    
    const stateInput = screen.getByLabelText(/state/i);
    await user.type(stateInput, 'CA');
    
    const zipInput = screen.getByLabelText(/zip code/i);
    await user.type(zipInput, '90001');
    
    const saveButton = screen.getByText('Create');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(mockAddDoc).toHaveBeenCalled();
    });
  });

  it('validates required fields when creating location', async () => {
    const user = userEvent.setup();
    
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Create Location')).toBeInTheDocument();
    });

    const createButton = screen.getByText('Create Location');
    await user.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create New Location')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Create');
    await user.click(saveButton);
    
    // Should not create without required fields
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('deletes a location', async () => {
    const user = userEvent.setup();
    mockGetDocs.mockResolvedValueOnce({ docs: [] } as any); // work orders query
    mockDeleteDoc.mockResolvedValueOnce(undefined);
    
    render(<LocationsManagement />);
    
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const deleteButton = screen.getByLabelText(/delete location/i);
    await user.click(deleteButton);
    
    // Toast confirmation should appear
    await waitFor(() => {
      expect(screen.getByText(/delete location/i)).toBeInTheDocument();
    });
  });
});

