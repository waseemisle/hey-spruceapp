'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import Logo from '@/components/ui/logo'
import { ClientRegistrationData } from '@/lib/types'

export default function RegisterClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState<ClientRegistrationData>({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    businessType: '',
    numberOfProperties: '',
    estimatedMonthlySpend: '',
    preferredServices: [],
    password: '',
    confirmPassword: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA'
    }
  })

  const businessTypes = [
    'Property Management Company',
    'Real Estate Investment',
    'Commercial Property Owner',
    'Residential Property Owner',
    'HOA/Community Association',
    'Government/Public Sector',
    'Healthcare Facility',
    'Educational Institution',
    'Retail/Commercial Chain',
    'Other'
  ]

  const preferredServicesOptions = [
    'Maintenance & Repairs',
    'Cleaning Services',
    'Landscaping',
    'HVAC Services',
    'Electrical Work',
    'Plumbing',
    'Painting',
    'Flooring',
    'Roofing',
    'Security Services',
    'Pest Control',
    'Other'
  ]

  const handleInputChange = (field: string, value: any) => {
    if (field.startsWith('address.')) {
      const addressField = field.split('.')[1]
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  const handleServiceToggle = (service: string) => {
    setFormData(prev => ({
      ...prev,
      preferredServices: prev.preferredServices.includes(service)
        ? prev.preferredServices.filter(s => s !== service)
        : [...prev.preferredServices, service]
    }))
  }

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      setError('Full name is required')
      return false
    }
    if (!formData.email.trim()) {
      setError('Email is required')
      return false
    }
    if (!formData.phone.trim()) {
      setError('Phone number is required')
      return false
    }
    if (!formData.password) {
      setError('Password is required')
      return false
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return false
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    if (!formData.address.street.trim()) {
      setError('Street address is required')
      return false
    }
    if (!formData.address.city.trim()) {
      setError('City is required')
      return false
    }
    if (!formData.address.state.trim()) {
      setError('State is required')
      return false
    }
    if (!formData.address.zipCode.trim()) {
      setError('ZIP code is required')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/register-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed')
      }

      setSuccess('Registration successful! Your account is pending admin approval. You will receive an email notification once approved.')
      
      // Reset form
      setFormData({
        fullName: '',
        email: '',
        phone: '',
        companyName: '',
        businessType: '',
        numberOfProperties: '',
        estimatedMonthlySpend: '',
        preferredServices: [],
        password: '',
        confirmPassword: '',
        address: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'USA'
        }
      })

      setTimeout(() => {
        router.push('/portal-login')
      }, 3000)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Logo size="xl" />
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Client Registration</h1>
          <p className="text-gray-600 mt-2">Join Hey Spruce as a client to manage your property maintenance needs</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Please provide your information to create your client account. All fields marked with * are required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}
            
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="Enter your phone number"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    placeholder="Enter your company name (optional)"
                  />
                </div>
              </div>

              {/* Business Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="businessType">Business Type</Label>
                  <Select value={formData.businessType} onValueChange={(value) => handleInputChange('businessType', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="numberOfProperties">Number of Properties</Label>
                  <Select value={formData.numberOfProperties} onValueChange={(value) => handleInputChange('numberOfProperties', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select number of properties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-5">1-5 Properties</SelectItem>
                      <SelectItem value="6-20">6-20 Properties</SelectItem>
                      <SelectItem value="21-50">21-50 Properties</SelectItem>
                      <SelectItem value="51-100">51-100 Properties</SelectItem>
                      <SelectItem value="100+">100+ Properties</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="estimatedMonthlySpend">Estimated Monthly Spend</Label>
                <Select value={formData.estimatedMonthlySpend} onValueChange={(value) => handleInputChange('estimatedMonthlySpend', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select estimated monthly spend" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under-1000">Under $1,000</SelectItem>
                    <SelectItem value="1000-5000">$1,000 - $5,000</SelectItem>
                    <SelectItem value="5000-10000">$5,000 - $10,000</SelectItem>
                    <SelectItem value="10000-25000">$10,000 - $25,000</SelectItem>
                    <SelectItem value="over-25000">Over $25,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preferred Services */}
              <div>
                <Label>Preferred Services</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                  {preferredServicesOptions.map((service) => (
                    <div key={service} className="flex items-center space-x-2">
                      <Checkbox
                        id={service}
                        checked={formData.preferredServices.includes(service)}
                        onCheckedChange={() => handleServiceToggle(service)}
                      />
                      <Label htmlFor={service} className="text-sm">
                        {service}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Address */}
              <div>
                <Label className="text-lg font-semibold">Address Information</Label>
                <div className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="street">Street Address *</Label>
                    <Input
                      id="street"
                      value={formData.address.street}
                      onChange={(e) => handleInputChange('address.street', e.target.value)}
                      placeholder="Enter street address"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        value={formData.address.city}
                        onChange={(e) => handleInputChange('address.city', e.target.value)}
                        placeholder="Enter city"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State *</Label>
                      <Input
                        id="state"
                        value={formData.address.state}
                        onChange={(e) => handleInputChange('address.state', e.target.value)}
                        placeholder="Enter state"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="zipCode">ZIP Code *</Label>
                      <Input
                        id="zipCode"
                        value={formData.address.zipCode}
                        onChange={(e) => handleInputChange('address.zipCode', e.target.value)}
                        placeholder="Enter ZIP code"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Enter password (min 6 characters)"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder="Confirm your password"
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/portal-login')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-primary hover:bg-primary/90"
                >
                  {loading ? 'Registering...' : 'Register as Client'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Already have an account? <a href="/portal-login" className="text-primary hover:underline">Sign in here</a></p>
        </div>
      </div>
    </div>
  )
}
