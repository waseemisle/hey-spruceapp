import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getDoc } from 'firebase/firestore'
import PortalLogin from '@/app/portal-login/page'

// Mock the hooks and functions
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
  getDoc: jest.fn(),
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

describe('PortalLogin', () => {
  const mockPush = jest.fn()
  const mockSignInWithEmailAndPassword = signInWithEmailAndPassword as jest.MockedFunction<typeof signInWithEmailAndPassword>
  const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
  })

  it('renders login form correctly', () => {
    render(<PortalLogin />)
    
    expect(screen.getByText('Portal Login')).toBeInTheDocument()
    expect(screen.getByText('Enter your credentials to access your portal')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup()
    render(<PortalLogin />)
    
    const loginButton = screen.getByRole('button', { name: 'Login' })
    await user.click(loginButton)
    
    expect(screen.getByLabelText('Email')).toBeRequired()
    expect(screen.getByLabelText('Password')).toBeRequired()
  })

  it('handles successful admin login', async () => {
    const user = userEvent.setup()
    const mockUser = { uid: 'admin-uid', email: 'admin@test.com' }
    
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: mockUser,
    } as any)
    
    // Mock admin user document
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin' }),
    } as any)
    
    render(<PortalLogin />)
    
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'admin@test.com',
        'password123'
      )
    })
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin-portal')
    })
  })

  it('handles successful client login', async () => {
    const user = userEvent.setup()
    const mockUser = { uid: 'client-uid', email: 'client@test.com' }
    
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: mockUser,
    } as any)
    
    // Mock no admin user, but client user exists and is approved
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => false } as any) // admin check
      .mockResolvedValueOnce({ 
        exists: () => true, 
        data: () => ({ status: 'approved' }) 
      } as any) // client check
    
    render(<PortalLogin />)
    
    await user.type(screen.getByLabelText('Email'), 'client@test.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/client-portal')
    })
  })

  it('handles pending client login', async () => {
    const user = userEvent.setup()
    const mockUser = { uid: 'client-uid', email: 'client@test.com' }
    
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
    
    render(<PortalLogin />)
    
    await user.type(screen.getByLabelText('Email'), 'client@test.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalledWith('/client-portal')
    })
  })

  it('handles login errors', async () => {
    const user = userEvent.setup()
    
    mockSignInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/user-not-found',
      message: 'No account found with this email address.',
    })
    
    render(<PortalLogin />)
    
    await user.type(screen.getByLabelText('Email'), 'nonexistent@test.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalled()
    })
  })

  it('shows loading state during login', async () => {
    const user = userEvent.setup()
    
    mockSignInWithEmailAndPassword.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    )
    
    render(<PortalLogin />)
    
    await user.type(screen.getByLabelText('Email'), 'test@test.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    
    expect(screen.getByText('Logging in...')).toBeInTheDocument()
  })

  it('has correct navigation links', () => {
    render(<PortalLogin />)
    
    expect(screen.getByText('Forgot password?')).toBeInTheDocument()
    expect(screen.getByText('Register as Client')).toBeInTheDocument()
    expect(screen.getByText('Subcontractor')).toBeInTheDocument()
    expect(screen.getByText('← Back to Home')).toBeInTheDocument()
  })
})
