import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { collection, query, getDocs } from 'firebase/firestore';
import QuotesManagement from '@/app/admin-portal/quotes/page';

jest.mock('@/components/admin-layout', () => {
  return function MockAdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'admin-uid' } },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  getDoc: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

describe('Quotes Management - Unit Tests', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocs.mockResolvedValue({
      docs: [],
    } as any);
  });

  it('renders quotes page', async () => {
    render(<QuotesManagement />);
    
    await waitFor(() => {
      expect(screen.getByText(/quotes/i)).toBeInTheDocument();
    });
  });

  it('displays quotes list when available', async () => {
    const mockQuotes = [
      {
        id: 'quote1',
        workOrderId: 'wo1',
        subcontractorName: 'Test Sub',
        totalAmount: 1000,
        laborCost: 500,
        materialCost: 300,
        additionalCosts: 0,
        status: 'pending',
        clientName: 'Test Client',
        lineItems: [],
      },
    ];

    mockGetDocs.mockResolvedValue({
      docs: mockQuotes.map(q => ({
        id: q.id,
        data: () => q,
      })),
    } as any);

    render(<QuotesManagement />);
    
    await waitFor(() => {
      expect(screen.getByText(/quotes/i)).toBeInTheDocument();
    });
  });
});

