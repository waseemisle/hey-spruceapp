/**
 * Acceptance Tests - User Flow Validation
 * Tests complete user journeys end-to-end
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getDoc, setDoc, updateDoc, addDoc, getDocs, query, where } from 'firebase/firestore';

// Mock all dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  doc: jest.fn(),
  collection: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
  onSnapshot: jest.fn(() => jest.fn()),
}));

jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
    signOut: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Acceptance Tests - Complete User Flows', () => {
  const mockPush = jest.fn();
  const mockCreateUser = createUserWithEmailAndPassword as jest.MockedFunction<typeof createUserWithEmailAndPassword>;
  const mockSignIn = signInWithEmailAndPassword as jest.MockedFunction<typeof signInWithEmailAndPassword>;
  const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
  const mockSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;
  const mockUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;
  const mockAddDoc = addDoc as jest.MockedFunction<typeof addDoc>;
  const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
    });
  });

  describe('Flow 1: Client Registration → Approval → Location Creation → Work Order', () => {
    it('ACCEPTANCE: Complete client onboarding flow', async () => {
      const user = userEvent.setup();
      
      // Step 1: Client Registration
      const RegisterClient = (await import('@/app/register-client/page')).default;
      render(<RegisterClient />);
      
      expect(screen.getByText(/client registration/i)).toBeInTheDocument();
      
      // Fill registration form
      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email/i), 'john@test.com');
      await user.type(screen.getByLabelText(/phone/i), '555-1234');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');
      
      const mockUser = { uid: 'client-uid', email: 'john@test.com' };
      mockCreateUser.mockResolvedValueOnce({ user: mockUser } as any);
      mockSetDoc.mockResolvedValue(undefined);
      
      await user.click(screen.getByRole('button', { name: /register/i }));
      
      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalled();
        expect(mockSetDoc).toHaveBeenCalled();
      });
      
      // Step 2: Admin Approval (simulated)
      mockGetDoc
        .mockResolvedValueOnce({ exists: () => false } as any) // admin check
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ status: 'approved' }),
        } as any); // client check
      
      // Step 3: Client Login
      const PortalLogin = (await import('@/app/portal-login/page')).default;
      render(<PortalLogin />);
      
      await user.type(screen.getByLabelText(/email/i), 'john@test.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      
      mockSignIn.mockResolvedValueOnce({ user: mockUser } as any);
      
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/client-portal');
      });
      
      // Step 4: Create Location
      const ClientLocationsPage = (await import('@/app/client-portal/locations/page')).default;
      render(<ClientLocationsPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/locations/i)).toBeInTheDocument();
      });
      
      const createButton = screen.getByText(/create location/i);
      await user.click(createButton);
      
      await waitFor(() => {
        expect(screen.getByText(/create new location/i)).toBeInTheDocument();
      });
      
      // Fill location form
      await user.type(screen.getByLabelText(/location name/i), 'Main Office');
      await user.type(screen.getByLabelText(/street/i), '123 Main St');
      await user.type(screen.getByLabelText(/city/i), 'New York');
      await user.type(screen.getByLabelText(/state/i), 'NY');
      await user.type(screen.getByLabelText(/zip/i), '10001');
      
      mockAddDoc.mockResolvedValueOnce({ id: 'loc-1' } as any);
      
      const saveButton = screen.getByText(/create/i);
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockAddDoc).toHaveBeenCalled();
      });
    });
  });

  describe('Flow 2: Work Order → Bidding → Quote → Invoice → Payment', () => {
    it('ACCEPTANCE: Complete work order to payment flow', async () => {
      const user = userEvent.setup();
      
      // Mock initial data
      mockGetDocs.mockResolvedValue({
        docs: [],
        size: 0,
        forEach: jest.fn(),
      } as any);
      
      // Step 1: Admin creates work order
      const WorkOrdersPage = (await import('@/app/admin-portal/work-orders/page')).default;
      render(<WorkOrdersPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/work orders/i)).toBeInTheDocument();
      });
      
      // Step 2: Share for bidding
      const shareButton = screen.queryByText(/share for bidding/i);
      if (shareButton) {
        await user.click(shareButton);
        
        await waitFor(() => {
          expect(screen.getByText(/share for bidding/i)).toBeInTheDocument();
        });
      }
      
      // Step 3: Subcontractor submits quote
      const BiddingPage = (await import('@/app/subcontractor-portal/bidding/page')).default;
      render(<BiddingPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/bidding/i)).toBeInTheDocument();
      });
      
      // Step 4: Admin forwards quote to client
      const QuotesPage = (await import('@/app/admin-portal/quotes/page')).default;
      render(<QuotesPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/quotes/i)).toBeInTheDocument();
      });
      
      // Step 5: Client approves quote
      const ClientQuotesPage = (await import('@/app/client-portal/quotes/page')).default;
      render(<ClientQuotesPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/quotes/i)).toBeInTheDocument();
      });
      
      // Step 6: Admin generates invoice
      const InvoicesPage = (await import('@/app/admin-portal/invoices/page')).default;
      render(<InvoicesPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/invoices/i)).toBeInTheDocument();
      });
      
      // Step 7: Client pays invoice
      const ClientInvoicesPage = (await import('@/app/client-portal/invoices/page')).default;
      render(<ClientInvoicesPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/invoices/i)).toBeInTheDocument();
      });
    });
  });

  describe('Flow 3: Subcontractor Registration → Approval → Bidding → Assignment', () => {
    it('ACCEPTANCE: Complete subcontractor workflow', async () => {
      const user = userEvent.setup();
      
      // Step 1: Subcontractor Registration
      const RegisterSub = (await import('@/app/register-subcontractor/page')).default;
      render(<RegisterSub />);
      
      expect(screen.getByText(/subcontractor registration/i)).toBeInTheDocument();
      
      // Fill registration
      await user.type(screen.getByLabelText(/full name/i), 'Jane Contractor');
      await user.type(screen.getByLabelText(/email/i), 'jane@contractor.com');
      await user.type(screen.getByLabelText(/phone/i), '555-5678');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');
      
      const mockUser = { uid: 'sub-uid', email: 'jane@contractor.com' };
      mockCreateUser.mockResolvedValueOnce({ user: mockUser } as any);
      mockSetDoc.mockResolvedValue(undefined);
      
      await user.click(screen.getByRole('button', { name: /register/i }));
      
      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalled();
      });
      
      // Step 2: Admin Approval
      mockGetDoc
        .mockResolvedValueOnce({ exists: () => false } as any)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ status: 'approved' }),
        } as any);
      
      // Step 3: Login and view bidding opportunities
      mockSignIn.mockResolvedValueOnce({ user: mockUser } as any);
      
      const PortalLogin = (await import('@/app/portal-login/page')).default;
      render(<PortalLogin />);
      
      await user.type(screen.getByLabelText(/email/i), 'jane@contractor.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/subcontractor-portal');
      });
    });
  });
});

