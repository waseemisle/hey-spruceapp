import { render, screen, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import PaymentSuccess from '@/app/payment-success/page';

// Mock Next.js hooks
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('PaymentSuccess Page', () => {
  const mockPush = jest.fn();
  const mockGet = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    
    (useSearchParams as jest.Mock).mockReturnValue({
      get: mockGet,
    });
    
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        totalAmount: 100.00,
        invoiceNumber: 'INV-001',
        clientName: 'Test Client',
      }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders payment success page with session ID', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'session_id') return 'cs_test_123';
      if (key === 'invoice_id') return 'invoice_123';
      return null;
    });

    render(<PaymentSuccess />);

    await waitFor(() => {
      expect(screen.getByText('Payment Successful!')).toBeInTheDocument();
      expect(screen.getByText('cs_test_123')).toBeInTheDocument();
    });
  });

  it('renders payment success page without session ID', async () => {
    mockGet.mockReturnValue(null);

    render(<PaymentSuccess />);

    await waitFor(() => {
      expect(screen.getByText('Payment Successful!')).toBeInTheDocument();
    });
  });

  it('handles back to portal button click', async () => {
    mockGet.mockReturnValue(null);

    render(<PaymentSuccess />);

    await waitFor(() => {
      const backButton = screen.getByText('Back to Portal');
      backButton.click();
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('displays loading state initially', () => {
    mockGet.mockReturnValue(null);

    render(<PaymentSuccess />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
