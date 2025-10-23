import { render, screen } from '@testing-library/react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

describe('Card Components', () => {
  it('renders basic card structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card Content</p>
        </CardContent>
        <CardFooter>
          <p>Card Footer</p>
        </CardFooter>
      </Card>
    )

    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Card Description')).toBeInTheDocument()
    expect(screen.getByText('Card Content')).toBeInTheDocument()
    expect(screen.getByText('Card Footer')).toBeInTheDocument()
  })

  it('renders card with only content', () => {
    render(
      <Card>
        <CardContent>
          <p>Simple Card</p>
        </CardContent>
      </Card>
    )

    expect(screen.getByText('Simple Card')).toBeInTheDocument()
  })

  it('applies custom className to Card', () => {
    render(
      <Card className="custom-card">
        <CardContent>Test</CardContent>
      </Card>
    )

    const card = screen.getByText('Test').closest('div')
    expect(card).toHaveClass('custom-card')
  })

  it('renders multiple cards', () => {
    render(
      <div>
        <Card>
          <CardContent>Card 1</CardContent>
        </Card>
        <Card>
          <CardContent>Card 2</CardContent>
        </Card>
      </div>
    )

    expect(screen.getByText('Card 1')).toBeInTheDocument()
    expect(screen.getByText('Card 2')).toBeInTheDocument()
  })

  it('renders card with complex content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <h3>Personal Information</h3>
            <p>Name: John Doe</p>
            <p>Email: john@example.com</p>
          </div>
        </CardContent>
        <CardFooter>
          <button>Save Changes</button>
        </CardFooter>
      </Card>
    )

    expect(screen.getByText('User Profile')).toBeInTheDocument()
    expect(screen.getByText('Manage your account settings')).toBeInTheDocument()
    expect(screen.getByText('Personal Information')).toBeInTheDocument()
    expect(screen.getByText('Name: John Doe')).toBeInTheDocument()
    expect(screen.getByText('Email: john@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
  })
})
