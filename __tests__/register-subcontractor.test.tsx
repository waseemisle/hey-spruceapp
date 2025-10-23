import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { setDoc } from 'firebase/firestore'
import RegisterSubcontractor from '@/app/register-subcontractor/page'

// Mock the hooks and functions
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
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

describe('RegisterSubcontractor', () => {
  const mockPush = jest.fn()
  const mockCreateUserWithEmailAndPassword = createUserWithEmailAndPassword as jest.MockedFunction<typeof createUserWithEmailAndPassword>
  const mockSetDoc = setDoc as jest.MockedFunction<typeof setDoc>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
  })

  it('renders registration form correctly', () => {
    render(<RegisterSubcontractor />)
    
    expect(screen.getByText('Subcontractor Registration')).toBeInTheDocument()
    expect(screen.getByText('Create your subcontractor account to bid on work orders')).toBeInTheDocument()
    expect(screen.getByLabelText('Full Name *')).toBeInTheDocument()
    expect(screen.getByLabelText('Business Name *')).toBeInTheDocument()
    expect(screen.getByLabelText('Email *')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone Number *')).toBeInTheDocument()
    expect(screen.getByLabelText('Skills (comma-separated) *')).toBeInTheDocument()
    expect(screen.getByLabelText('License Number')).toBeInTheDocument()
    expect(screen.getByLabelText('Password *')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
  })

  it('validates password confirmation', async () => {
    const user = userEvent.setup()
    render(<RegisterSubcontractor />)
    
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'different123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    // Should not call createUserWithEmailAndPassword
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled()
  })

  it('validates minimum password length', async () => {
    const user = userEvent.setup()
    render(<RegisterSubcontractor />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Smith')
    await user.type(screen.getByLabelText('Business Name *'), 'Smith Services')
    await user.type(screen.getByLabelText('Email *'), 'john@smithservices.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-123-4567')
    await user.type(screen.getByLabelText('Skills (comma-separated) *'), 'HVAC, Plumbing')
    await user.type(screen.getByLabelText('Password *'), '123')
    await user.type(screen.getByLabelText('Confirm Password *'), '123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    // Should not call createUserWithEmailAndPassword
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled()
  })

  it('handles successful registration', async () => {
    const user = userEvent.setup()
    const mockUser = { uid: 'sub-uid', email: 'john@smithservices.com' }
    
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockUser,
    } as any)
    
    mockSetDoc.mockResolvedValueOnce(undefined)
    
    render(<RegisterSubcontractor />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Smith')
    await user.type(screen.getByLabelText('Business Name *'), 'Smith Services LLC')
    await user.type(screen.getByLabelText('Email *'), 'john@smithservices.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-987-6543')
    await user.type(screen.getByLabelText('Skills (comma-separated) *'), 'HVAC, Plumbing, Electrical')
    await user.type(screen.getByLabelText('License Number'), 'LIC-12345')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'john@smithservices.com',
        'password123'
      )
    })
    
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(2) // subcontractors and users collections
    })
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal-login')
    })
  })

  it('converts skills string to array correctly', async () => {
    const user = userEvent.setup()
    const mockUser = { uid: 'sub-uid', email: 'john@smithservices.com' }
    
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockUser,
    } as any)
    
    mockSetDoc.mockResolvedValueOnce(undefined)
    
    render(<RegisterSubcontractor />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Smith')
    await user.type(screen.getByLabelText('Business Name *'), 'Smith Services LLC')
    await user.type(screen.getByLabelText('Email *'), 'john@smithservices.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-987-6543')
    await user.type(screen.getByLabelText('Skills (comma-separated) *'), 'HVAC, Plumbing, Electrical')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          skills: ['HVAC', 'Plumbing', 'Electrical'],
        }),
        expect.anything()
      )
    })
  })

  it('handles registration errors', async () => {
    const user = userEvent.setup()
    
    mockCreateUserWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/email-already-in-use',
      message: 'The email address is already in use by another account.',
    })
    
    render(<RegisterSubcontractor />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Smith')
    await user.type(screen.getByLabelText('Business Name *'), 'Smith Services LLC')
    await user.type(screen.getByLabelText('Email *'), 'existing@test.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-987-6543')
    await user.type(screen.getByLabelText('Skills (comma-separated) *'), 'HVAC, Plumbing')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalled()
    })
  })

  it('shows loading state during registration', async () => {
    const user = userEvent.setup()
    
    mockCreateUserWithEmailAndPassword.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    )
    
    render(<RegisterSubcontractor />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Smith')
    await user.type(screen.getByLabelText('Business Name *'), 'Smith Services LLC')
    await user.type(screen.getByLabelText('Email *'), 'john@smithservices.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-987-6543')
    await user.type(screen.getByLabelText('Skills (comma-separated) *'), 'HVAC, Plumbing')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    expect(screen.getByText('Creating Account...')).toBeInTheDocument()
  })

  it('has correct navigation links', () => {
    render(<RegisterSubcontractor />)
    
    expect(screen.getByText('Already have an account?')).toBeInTheDocument()
    expect(screen.getByText('Login here')).toBeInTheDocument()
    expect(screen.getByText('← Back to Home')).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    const user = userEvent.setup()
    render(<RegisterSubcontractor />)
    
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    expect(screen.getByLabelText('Full Name *')).toBeRequired()
    expect(screen.getByLabelText('Business Name *')).toBeRequired()
    expect(screen.getByLabelText('Email *')).toBeRequired()
    expect(screen.getByLabelText('Phone Number *')).toBeRequired()
    expect(screen.getByLabelText('Skills (comma-separated) *')).toBeRequired()
    expect(screen.getByLabelText('Password *')).toBeRequired()
    expect(screen.getByLabelText('Confirm Password *')).toBeRequired()
  })
})
