import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { setDoc } from 'firebase/firestore'
import RegisterClient from '@/app/register-client/page'

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

describe('RegisterClient', () => {
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
    render(<RegisterClient />)
    
    expect(screen.getByText('Client Registration')).toBeInTheDocument()
    expect(screen.getByText('Create your client account to manage property maintenance')).toBeInTheDocument()
    expect(screen.getByLabelText('Full Name *')).toBeInTheDocument()
    expect(screen.getByLabelText('Email *')).toBeInTheDocument()
    expect(screen.getByLabelText('Company Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone Number *')).toBeInTheDocument()
    expect(screen.getByLabelText('Password *')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
  })

  it('validates password confirmation', async () => {
    const user = userEvent.setup()
    render(<RegisterClient />)
    
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'different123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    // Should not call createUserWithEmailAndPassword
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled()
  })

  it('validates minimum password length', async () => {
    const user = userEvent.setup()
    render(<RegisterClient />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Doe')
    await user.type(screen.getByLabelText('Email *'), 'john@test.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-123-4567')
    await user.type(screen.getByLabelText('Password *'), '123')
    await user.type(screen.getByLabelText('Confirm Password *'), '123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    // Should not call createUserWithEmailAndPassword
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled()
  })

  it('handles successful registration', async () => {
    const user = userEvent.setup()
    const mockUser = { uid: 'client-uid', email: 'john@test.com' }
    
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockUser,
    } as any)
    
    mockSetDoc.mockResolvedValueOnce(undefined)
    
    render(<RegisterClient />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Doe')
    await user.type(screen.getByLabelText('Email *'), 'john@test.com')
    await user.type(screen.getByLabelText('Company Name'), 'Test Company')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-123-4567')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'john@test.com',
        'password123'
      )
    })
    
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(2) // clients and users collections
      // Verify password is stored in clients collection
      const clientsCall = mockSetDoc.mock.calls.find(call => 
        call[0]?.path?.includes('clients')
      )
      expect(clientsCall).toBeDefined()
      expect(clientsCall?.[1]).toHaveProperty('password', 'password123')
    })
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal-login')
    })
  })

  it('handles registration errors', async () => {
    const user = userEvent.setup()
    
    mockCreateUserWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/email-already-in-use',
      message: 'The email address is already in use by another account.',
    })
    
    render(<RegisterClient />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Doe')
    await user.type(screen.getByLabelText('Email *'), 'existing@test.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-123-4567')
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
    
    render(<RegisterClient />)
    
    await user.type(screen.getByLabelText('Full Name *'), 'John Doe')
    await user.type(screen.getByLabelText('Email *'), 'john@test.com')
    await user.type(screen.getByLabelText('Phone Number *'), '+1 555-123-4567')
    await user.type(screen.getByLabelText('Password *'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password *'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    expect(screen.getByText('Creating Account...')).toBeInTheDocument()
  })

  it('has correct navigation links', () => {
    render(<RegisterClient />)
    
    expect(screen.getByText('Already have an account?')).toBeInTheDocument()
    expect(screen.getByText('Login here')).toBeInTheDocument()
    expect(screen.getByText('← Back to Home')).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    const user = userEvent.setup()
    render(<RegisterClient />)
    
    await user.click(screen.getByRole('button', { name: 'Register' }))
    
    expect(screen.getByLabelText('Full Name *')).toBeRequired()
    expect(screen.getByLabelText('Email *')).toBeRequired()
    expect(screen.getByLabelText('Phone Number *')).toBeRequired()
    expect(screen.getByLabelText('Password *')).toBeRequired()
    expect(screen.getByLabelText('Confirm Password *')).toBeRequired()
  })
})
