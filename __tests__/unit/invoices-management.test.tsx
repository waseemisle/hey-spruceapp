import { render, screen, waitFor } from '@testing-library/react';
import { collection, query, getDocs } from 'firebase/firestore';
import InvoicesManagement from '@/app/admin-portal/invoices/page';

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

describe('Invoices Management - Unit Tests', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocs.mockResolvedValue({
      docs: [],
    } as any);
  });

  it('renders invoices page', async () => {
    render(<InvoicesManagement />);
    
    await waitFor(() => {
      expect(screen.getByText(/invoices/i)).toBeInTheDocument();
    });
  });
});

