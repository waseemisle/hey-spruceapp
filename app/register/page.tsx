'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Building2, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase,
  ArrowLeft,
  CheckCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Logo from '@/components/ui/logo'

interface RegistrationData {
  companyName: string
  contactPerson: string
  email: string
  phone: string
  address: string
  businessType: string
  numberOfProperties: string
  estimatedMonthlySpend: string
  preferredServices: string[]
  additionalInfo: string
  password: string
  confirmPassword: string
  agreeToTerms: boolean
}

const businessTypes = [
  'Property Management Company',
  'Real Estate Developer',
  'Corporate Office',
  'Retail Chain',
  'Hospitality',
  'Healthcare Facility',
  'Educational Institution',
  'Manufacturing',
  'Other'
]

const serviceOptions = [
  'HVAC Maintenance',
  'Plumbing Services',
  'Electrical Work',
  'Landscaping',
  'Cleaning Services',
  'Security Systems',
  'General Maintenance',
  'Emergency Repairs'
]

export default function ClientRegistration() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formData, setFormData] = useState<RegistrationData>({
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    businessType: '',
    numberOfProperties: '',
    estimatedMonthlySpend: '',
    preferredServices: [],
    additionalInfo: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false
  })

  // Handle URL parameters for pre-filled data
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const email = urlParams.get('email')
    const name = urlParams.get('name')

    if (token && email && name) {
      // Pre-fill form with data from the link
      setFormData(prev => ({
        ...prev,
        email: decodeURIComponent(email),
        contactPerson: decodeURIComponent(name)
      }))
    }
  }, [])

  const handleInputChange = (field: keyof RegistrationData, value: string | boolean | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleServiceToggle = (service: string) => {
    setFormData(prev => ({
      ...prev,
      preferredServices: prev.preferredServices.includes(service)
        ? prev.preferredServices.filter(s => s !== service)
        : [...prev.preferredServices, service]
    }))
  }

  const validateStep1 = () => {
    return formData.companyName && formData.contactPerson && formData.email && formData.phone
  }

  const validateStep2 = () => {
    return formData.address && formData.businessType && formData.numberOfProperties
  }

  const validateStep3 = () => {
    return formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && formData.agreeToTerms
  }

  const handleSubmit = async () => {
    if (!validateStep3()) return

    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/register-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setIsSubmitted(true)
      } else {
        const error = await response.json()
        alert('Registration failed: ' + error.message)
      }
    } catch (error) {
      console.error('Registration error:', error)
      alert('Registration failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900">Company Information</h2>
        <p className="text-gray-600 mt-2">Tell us about your company</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name *</Label>
          <Input
            id="companyName"
            value={formData.companyName}
            onChange={(e) => handleInputChange('companyName', e.target.value)}
            placeholder="Enter your company name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactPerson">Contact Person *</Label>
          <Input
            id="contactPerson"
            value={formData.contactPerson}
            onChange={(e) => handleInputChange('contactPerson', e.target.value)}
            placeholder="Full name of contact person"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="company@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            placeholder="+1 (555) 123-4567"
          />
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <MapPin className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900">Business Details</h2>
        <p className="text-gray-600 mt-2">Help us understand your needs</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="address">Business Address *</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => handleInputChange('address', e.target.value)}
            placeholder="Full business address"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="businessType">Business Type *</Label>
          <select
            id="businessType"
            value={formData.businessType}
            onChange={(e) => handleInputChange('businessType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select business type</option>
            {businessTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="numberOfProperties">Number of Properties *</Label>
            <Input
              id="numberOfProperties"
              type="number"
              value={formData.numberOfProperties}
              onChange={(e) => handleInputChange('numberOfProperties', e.target.value)}
              placeholder="e.g., 5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedMonthlySpend">Estimated Monthly Spend</Label>
            <Input
              id="estimatedMonthlySpend"
              value={formData.estimatedMonthlySpend}
              onChange={(e) => handleInputChange('estimatedMonthlySpend', e.target.value)}
              placeholder="e.g., $10,000"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label>Preferred Services</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {serviceOptions.map(service => (
              <div key={service} className="flex items-center space-x-2">
                <Checkbox
                  id={service}
                  checked={formData.preferredServices.includes(service)}
                  onCheckedChange={() => handleServiceToggle(service)}
                />
                <Label htmlFor={service} className="text-sm">{service}</Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="additionalInfo">Additional Information</Label>
          <textarea
            id="additionalInfo"
            value={formData.additionalInfo}
            onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
            placeholder="Any additional information about your maintenance needs..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px]"
          />
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <User className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900">Account Setup</h2>
        <p className="text-gray-600 mt-2">Create your login credentials</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password *</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            placeholder="Create a secure password"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password *</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
            placeholder="Confirm your password"
          />
          {formData.confirmPassword && formData.password !== formData.confirmPassword && (
            <p className="text-red-500 text-sm">Passwords do not match</p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="agreeToTerms"
            checked={formData.agreeToTerms}
            onCheckedChange={(checked) => handleInputChange('agreeToTerms', checked as boolean)}
          />
          <Label htmlFor="agreeToTerms" className="text-sm">
            I agree to the{' '}
            <a href="#" className="text-primary hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>
          </Label>
        </div>
      </div>
    </div>
  )

  const renderSuccess = () => (
    <div className="text-center space-y-6">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Submitted!</h2>
        <p className="text-gray-600">
          Thank you for your interest in Spruce App services. Your registration has been submitted for admin approval.
        </p>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
        <ul className="text-sm text-blue-800 space-y-1 text-left">
          <li>• Your registration will be reviewed by our admin team</li>
          <li>• You'll receive an email notification once approved</li>
          <li>• You can then log in with your credentials</li>
          <li>• Expected approval time: 1-2 business days</li>
        </ul>
      </div>

      <Button onClick={() => router.push('/portal-login')} className="w-full">
        Go to Login Page
      </Button>
    </div>
  )

  if (isSubmitted) {
    return renderSuccess()
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4 mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/portal-login')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Logo size="lg" />
              <div>
                <CardTitle className="text-2xl">Client Registration</CardTitle>
                <CardDescription>
                  Join Spruce App for comprehensive property maintenance solutions
                </CardDescription>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center space-x-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                    currentStep >= step 
                      ? "bg-primary text-white" 
                      : "bg-gray-200 text-gray-600"
                  )}>
                    {step}
                  </div>
                  {step < 3 && (
                    <div className={cn(
                      "w-12 h-1 mx-2",
                      currentStep > step ? "bg-primary" : "bg-gray-200"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </CardHeader>

          <CardContent>
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}

            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
              >
                Previous
              </Button>

              {currentStep < 3 ? (
                <Button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={
                    (currentStep === 1 && !validateStep1()) ||
                    (currentStep === 2 && !validateStep2())
                  }
                >
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!validateStep3() || isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Registration'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
