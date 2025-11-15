/**
 * Smoke Tests - Critical Path Verification
 * These tests verify that all major features can be accessed and basic functionality works
 */

import { render, screen, waitFor } from '@testing-library/react';
import { collection, query, getDocs } from 'firebase/firestore';

// Mock all dependencies
jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-uid' },
  },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
  onSnapshot: jest.fn(() => jest.fn()),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Smoke Tests - All Features', () => {
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocs.mockResolvedValue({
      docs: [],
      size: 0,
      forEach: jest.fn(),
    } as any);
  });

  describe('Admin Portal Features', () => {
    it('SMOKE: Admin Dashboard loads', async () => {
      const AdminDashboard = (await import('@/app/admin-portal/page')).default;
      render(<AdminDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Clients page loads', async () => {
      const ClientsPage = (await import('@/app/admin-portal/clients/page')).default;
      render(<ClientsPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/clients/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Locations page loads', async () => {
      const LocationsPage = (await import('@/app/admin-portal/locations/page')).default;
      render(<LocationsPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/locations/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Work Orders page loads', async () => {
      const WorkOrdersPage = (await import('@/app/admin-portal/work-orders/page')).default;
      render(<WorkOrdersPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/work orders/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Quotes page loads', async () => {
      const QuotesPage = (await import('@/app/admin-portal/quotes/page')).default;
      render(<QuotesPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/quotes/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Invoices page loads', async () => {
      const InvoicesPage = (await import('@/app/admin-portal/invoices/page')).default;
      render(<InvoicesPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/invoices/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Subcontractors page loads', async () => {
      const SubcontractorsPage = (await import('@/app/admin-portal/subcontractors/page')).default;
      render(<SubcontractorsPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/subcontractors/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Recurring Work Orders page loads', async () => {
      const RecurringWOPage = (await import('@/app/admin-portal/recurring-work-orders/page')).default;
      render(<RecurringWOPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/recurring/i)).toBeInTheDocument();
      });
    });
  });

  describe('Client Portal Features', () => {
    it('SMOKE: Client Dashboard loads', async () => {
      const ClientDashboard = (await import('@/app/client-portal/page')).default;
      render(<ClientDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Client Locations page loads', async () => {
      const ClientLocationsPage = (await import('@/app/client-portal/locations/page')).default;
      render(<ClientLocationsPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/locations/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Client Work Orders page loads', async () => {
      const ClientWOPage = (await import('@/app/client-portal/work-orders/page')).default;
      render(<ClientWOPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/work orders/i)).toBeInTheDocument();
      });
    });
  });

  describe('Subcontractor Portal Features', () => {
    it('SMOKE: Subcontractor Dashboard loads', async () => {
      const SubDashboard = (await import('@/app/subcontractor-portal/page')).default;
      render(<SubDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Bidding page loads', async () => {
      const BiddingPage = (await import('@/app/subcontractor-portal/bidding/page')).default;
      render(<BiddingPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/bidding/i)).toBeInTheDocument();
      });
    });

    it('SMOKE: Assigned Jobs page loads', async () => {
      const AssignedPage = (await import('@/app/subcontractor-portal/assigned/page')).default;
      render(<AssignedPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/assigned/i)).toBeInTheDocument();
      });
    });
  });

  describe('Authentication Features', () => {
    it('SMOKE: Login page loads', async () => {
      const LoginPage = (await import('@/app/portal-login/page')).default;
      render(<LoginPage />);
      
      expect(screen.getByText(/login/i)).toBeInTheDocument();
    });

    it('SMOKE: Client Registration page loads', async () => {
      const RegisterClient = (await import('@/app/register-client/page')).default;
      render(<RegisterClient />);
      
      expect(screen.getByText(/register/i)).toBeInTheDocument();
    });

    it('SMOKE: Subcontractor Registration page loads', async () => {
      const RegisterSub = (await import('@/app/register-subcontractor/page')).default;
      render(<RegisterSub />);
      
      expect(screen.getByText(/register/i)).toBeInTheDocument();
    });
  });

  describe('UI Components', () => {
    it('SMOKE: Theme toggle renders', async () => {
      const { ThemeToggle } = await import('@/components/theme-toggle');
      render(<ThemeToggle />);
      
      expect(screen.getByLabelText(/toggle theme/i)).toBeInTheDocument();
    });

    it('SMOKE: Button component renders', async () => {
      const { Button } = await import('@/components/ui/button');
      render(<Button>Test Button</Button>);
      
      expect(screen.getByText('Test Button')).toBeInTheDocument();
    });

    it('SMOKE: Card component renders', async () => {
      const { Card, CardHeader, CardTitle, CardContent } = await import('@/components/ui/card');
      render(
        <Card>
          <CardHeader>
            <CardTitle>Test Card</CardTitle>
          </CardHeader>
          <CardContent>Test Content</CardContent>
        </Card>
      );
      
      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });
  });
});

