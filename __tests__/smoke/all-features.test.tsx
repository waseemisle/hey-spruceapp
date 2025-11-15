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
  toast: jest.fn((message, options) => {
    return {
      id: 'mock-toast-id',
      dismiss: jest.fn(),
      update: jest.fn(),
    };
  }),
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
        const dashboardTexts = screen.getAllByText(/dashboard/i);
        expect(dashboardTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Clients page loads', async () => {
      const ClientsPage = (await import('@/app/admin-portal/clients/page')).default;
      render(<ClientsPage />);
      
      await waitFor(() => {
        const clientsTexts = screen.getAllByText(/clients/i);
        expect(clientsTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Locations page loads', async () => {
      const LocationsPage = (await import('@/app/admin-portal/locations/page')).default;
      render(<LocationsPage />);
      
      await waitFor(() => {
        const locationsTexts = screen.getAllByText(/locations/i);
        expect(locationsTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Work Orders page loads', async () => {
      const WorkOrdersPage = (await import('@/app/admin-portal/work-orders/page')).default;
      render(<WorkOrdersPage />);
      
      await waitFor(() => {
        const workOrdersTexts = screen.getAllByText(/work orders/i);
        expect(workOrdersTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Quotes page loads', async () => {
      const QuotesPage = (await import('@/app/admin-portal/quotes/page')).default;
      render(<QuotesPage />);
      
      await waitFor(() => {
        const quotesTexts = screen.getAllByText(/quotes/i);
        expect(quotesTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Invoices page loads', async () => {
      const InvoicesPage = (await import('@/app/admin-portal/invoices/page')).default;
      render(<InvoicesPage />);
      
      await waitFor(() => {
        const invoicesTexts = screen.getAllByText(/invoices/i);
        expect(invoicesTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Subcontractors page loads', async () => {
      const SubcontractorsPage = (await import('@/app/admin-portal/subcontractors/page')).default;
      render(<SubcontractorsPage />);
      
      await waitFor(() => {
        const subcontractorsTexts = screen.getAllByText(/subcontractors/i);
        expect(subcontractorsTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Recurring Work Orders page loads', async () => {
      const RecurringWOPage = (await import('@/app/admin-portal/recurring-work-orders/page')).default;
      render(<RecurringWOPage />);
      
      await waitFor(() => {
        const recurringTexts = screen.getAllByText(/recurring/i);
        expect(recurringTexts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Client Portal Features', () => {
    it('SMOKE: Client Dashboard loads', async () => {
      const ClientDashboard = (await import('@/app/client-portal/page')).default;
      render(<ClientDashboard />);
      
      await waitFor(() => {
        const dashboardTexts = screen.getAllByText(/dashboard/i);
        expect(dashboardTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Client Locations page loads', async () => {
      const ClientLocationsPage = (await import('@/app/client-portal/locations/page')).default;
      render(<ClientLocationsPage />);
      
      await waitFor(() => {
        const locationsTexts = screen.getAllByText(/locations/i);
        expect(locationsTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Client Work Orders page loads', async () => {
      const ClientWOPage = (await import('@/app/client-portal/work-orders/page')).default;
      render(<ClientWOPage />);
      
      await waitFor(() => {
        const workOrdersTexts = screen.getAllByText(/work orders/i);
        expect(workOrdersTexts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Subcontractor Portal Features', () => {
    it('SMOKE: Subcontractor Dashboard loads', async () => {
      const SubDashboard = (await import('@/app/subcontractor-portal/page')).default;
      render(<SubDashboard />);
      
      await waitFor(() => {
        const dashboardTexts = screen.getAllByText(/dashboard/i);
        expect(dashboardTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Bidding page loads', async () => {
      const BiddingPage = (await import('@/app/subcontractor-portal/bidding/page')).default;
      render(<BiddingPage />);
      
      await waitFor(() => {
        const biddingTexts = screen.getAllByText(/bidding/i);
        expect(biddingTexts.length).toBeGreaterThan(0);
      });
    });

    it('SMOKE: Assigned Jobs page loads', async () => {
      const AssignedPage = (await import('@/app/subcontractor-portal/assigned/page')).default;
      render(<AssignedPage />);
      
      await waitFor(() => {
        const assignedTexts = screen.getAllByText(/assigned/i);
        expect(assignedTexts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Authentication Features', () => {
    it('SMOKE: Login page loads', async () => {
      const LoginPage = (await import('@/app/portal-login/page')).default;
      render(<LoginPage />);
      
      const loginTexts = screen.getAllByText(/login/i);
      expect(loginTexts.length).toBeGreaterThan(0);
    });

    it('SMOKE: Client Registration page loads', async () => {
      const RegisterClient = (await import('@/app/register-client/page')).default;
      render(<RegisterClient />);
      
      const registerTexts = screen.getAllByText(/register/i);
      expect(registerTexts.length).toBeGreaterThan(0);
    });

    it('SMOKE: Subcontractor Registration page loads', async () => {
      const RegisterSub = (await import('@/app/register-subcontractor/page')).default;
      render(<RegisterSub />);
      
      const registerTexts = screen.getAllByText(/register/i);
      expect(registerTexts.length).toBeGreaterThan(0);
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

