import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { getDoc, setDoc } from 'firebase/firestore'
import Home from '@/app/page'
import RegisterClient from '@/app/register-client/page'
import PortalLogin from '@/app/portal-login/page'

// Mock the hooks and functions
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  doc: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
}))

jest.mock('@/lib/firebase', () => ({
  auth: {
    signOut: jest.fn(),
  },
  db: {},
}))

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}))

describe('Complete Client Registration and Login Flow', () => {
  const mockPush = jest.fn()
  const mockCreateUserWithEmailAndPassword = createUserWithEmailAndPassword as jest.MockedFunction<typeof createUserWithEmailAndPassword>
  const mockSignInWithEmailAndPassword = signInWithEmailAndPassword as jest.MockedFunction<typeof signInWithEmailAndPassword>
  const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>
  const mockSetDoc = setDoc as jest.MockedFunction<typeof setDoc>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
  })

  it('completes full client registration and login flow', async () => {
    const user = userEvent.setup()
    
    // Step 1: Render home page and navigate to client registration
    render(<Home />)
    
    expect(screen.getByText('Hey Spruce App - Property Maintenance Management System')).toBeInTheDocument()
    expect(screen.getByText('Client Portal')).toBeInTheDocument()
    
    const registerClientLink = screen.getByText('Register as Client')
    expect(registerClientLink).toBeInTheDocument()

    // Step 2: Navigate to client registration (simulated)
    render(<RegisterClient />)
    
    expect(screen.getByText('Client Registration')).toBeInTheDocument()
    
    // Step 3: Fill out registration form
    await user.type(screen.getByLabelText('Full Name *'), 'John Doe')
    await user.type(screen.getByLabelText('Email *'), 'john@testcompany.com')
    await user.type(screen.getByLabelText('Company Name'), 'Test Company LLC')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-123-4567')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    
    // Mock successful registration
    const mockUser = { uid: 'client-uid', email: 'john@testcompany.com' }
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockUser,
    } as any)
    mockSetDoc.mockResolvedValueOnce(undefined)
    
    // Step 4: Submit registration
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'john@testcompany.com',
        'password123'
      )
    })
    
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(2) // clients and users collections
    })
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal-login')
    })

    // Step 5: Navigate to login page (simulated)
    render(<PortalLogin />)
    
    expect(screen.getByText('Portal Login')).toBeInTheDocument()
    
    // Step 6: Attempt to login (should fail because account is pending)
    await user.type(screen.getByLabelText('Email'), 'john@testcompany.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: mockUser,
    } as any)
    
    // Mock no admin user, client user exists but is pending
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => false } as any) // admin check
      .mockResolvedValueOnce({ 
        exists: () => true, 
        data: () => ({ status: 'pending' }) 
      } as any) // client check
    
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'john@testcompany.com',
        'password123'
      )
    })
    
    // Should not redirect to client portal because account is pending
    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalledWith('/client-portal')
    })

    // Step 7: Simulate admin approval and successful login
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => false } as any) // admin check
      .mockResolvedValueOnce({ 
        exists: () => true, 
        data: () => ({ status: 'approved' }) 
      } as any) // client check
    
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/client-portal')
    })
  })

  it('handles registration validation errors', async () => {
    const user = userEvent.setup()
    render(<RegisterClient />)
    
    // Try to submit without filling required fields
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    // Should not call createUserWithEmailAndPassword
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled()
    
    // Fill invalid data
    await user.type(screen.getByLabelText('Password *'), '123')
    await user.type(screen.getByLabelText('Confirm Password *'), '456')
    
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    // Should not call createUserWithEmailAndPassword due to validation
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled()
  })

  it('handles login errors gracefully', async () => {
    const user = userEvent.setup()
    render(<PortalLogin />)
    
    await user.type(screen.getByLabelText('Email'), 'nonexistent@test.com')
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    
    mockSignInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/user-not-found',
      message: 'No account found with this email address.',
    })
    
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalled()
    })
    
    // Should not redirect on error
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('validates email format in registration', async () => {
    const user = userEvent.setup()
    render(<RegisterClient />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Doe')
    await user.type(screen.getByLabelText('Email *'), 'invalid-email')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-123-4567')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    // Email input should have type="email" which provides browser validation
    const emailInput = screen.getByLabelText('Email *')
    expect(emailInput).toHaveAttribute('type', 'email')
  })
})
