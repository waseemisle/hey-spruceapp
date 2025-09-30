'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { SubcontractorRegistrationData } from '@/lib/types'
import { useLoading } from '@/contexts/LoadingContext'
import { useNotifications } from '@/components/ui/notification'
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  Star, 
  DollarSign,
  Building,
  FileText,
  Users,
  ArrowLeft
} from 'lucide-react'

const SKILLS_OPTIONS = [
  'HVAC Installation',
  'HVAC Repair',
  'Electrical Work',
  'Plumbing',
  'Carpentry',
  'Painting',
  'Flooring',
  'Roofing',
  'General Maintenance',
  'Cleaning Services',
  'Inspection Services',
  'Emergency Repairs',
  'Appliance Repair',
  'Landscaping',
  'Security Systems',
  'Other'
]

const EXPERIENCE_LEVELS = [
  'Less than 1 year',
  '1-2 years',
  '3-5 years',
  '6-10 years',
  '10+ years'
]

export default function RegisterSubcontractorPage() {
  const router = useRouter()
  const { setLoading } = useLoading()
  const { success, error } = useNotifications()
  
  const [formData, setFormData] = useState<SubcontractorRegistrationData>({
    fullName: '',
    email: '',
    phone: '',
    title: '',
    categoryId: '',
    skills: [],
    experience: '',
    hourlyRate: '',
    password: '',
    confirmPassword: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States'
    },
    businessInfo: {
      businessName: '',
      licenseNumber: '',
      insuranceInfo: ''
    },
    references: [
      { name: '', contact: '', relationship: '' },
      { name: '', contact: '', relationship: '' }
    ]
  })

  const [categories, setCategories] = useState<any[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)

  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories')
        if (response.ok) {
          const data = await response.json()
          setCategories(data.filter((cat: any) => cat.isActive))
        }
      } catch (err) {
        console.error('Error fetching categories:', err)
      } finally {
        setLoadingCategories(false)
      }
    }
    fetchCategories()
  }, [])

  const handleInputChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof typeof prev] as any),
          [child]: value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  const handleSkillToggle = (skill: string) => {
    const newSkills = selectedSkills.includes(skill)
      ? selectedSkills.filter(s => s !== skill)
      : [...selectedSkills, skill]
    
    setSelectedSkills(newSkills)
    setFormData(prev => ({
      ...prev,
      skills: newSkills
    }))
  }

  const addReference = () => {
    setFormData(prev => ({
      ...prev,
      references: [...prev.references!, { name: '', contact: '', relationship: '' }]
    }))
  }

  const removeReference = (index: number) => {
    setFormData(prev => ({
      ...prev,
      references: prev.references!.filter((_, i) => i !== index)
    }))
  }

  const handleReferenceChange = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      references: prev.references!.map((ref, i) => 
        i === index ? { ...ref, [field]: value } : ref
      )
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.categoryId) {
      error('Please select a category')
      return
    }

    if (selectedSkills.length === 0) {
      error('Please select at least one skill')
      return
    }

    if (!formData.password) {
      error('Password is required')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      error('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      error('Password must be at least 6 characters long')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/register-subcontractor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          skills: selectedSkills
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register as subcontractor')
      }

      success('Subcontractor registration submitted successfully! You can now log in with your credentials. You will be notified once approved.')
      router.push('/portal-login')
    } catch (err) {
      console.error('Registration error:', err)
      error(err instanceof Error ? err.message : 'Failed to register as subcontractor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Register as Subcontractor</h1>
          <p className="text-gray-600">Join our network of skilled professionals</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>Tell us about yourself</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="title">Professional Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g., HVAC Technician, Electrician"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="categoryId">Category *</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => handleInputChange('categoryId', value)}
                  required
                  disabled={loadingCategories}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCategories ? "Loading categories..." : "Select your category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loadingCategories && (
                  <p className="text-sm text-gray-500 mt-1">Loading available categories...</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Account Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Setup
              </CardTitle>
              <CardDescription>Create your login credentials</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Skills and Experience */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Skills & Experience
              </CardTitle>
              <CardDescription>What services can you provide?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Skills * (Select all that apply)</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  {SKILLS_OPTIONS.map((skill) => (
                    <div key={skill} className="flex items-center space-x-2">
                      <Checkbox
                        id={skill}
                        checked={selectedSkills.includes(skill)}
                        onCheckedChange={() => handleSkillToggle(skill)}
                      />
                      <Label htmlFor={skill} className="text-sm">
                        {skill}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="experience">Years of Experience *</Label>
                  <Select
                    value={formData.experience}
                    onValueChange={(value) => handleInputChange('experience', value)}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select experience level" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPERIENCE_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="hourlyRate">Hourly Rate (USD)</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    placeholder="e.g., 25"
                    value={formData.hourlyRate}
                    onChange={(e) => handleInputChange('hourlyRate', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address
              </CardTitle>
              <CardDescription>Your primary work location</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="street">Street Address *</Label>
                <Input
                  id="street"
                  value={formData.address.street}
                  onChange={(e) => handleInputChange('address.street', e.target.value)}
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
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    value={formData.address.state}
                    onChange={(e) => handleInputChange('address.state', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="zipCode">ZIP Code *</Label>
                  <Input
                    id="zipCode"
                    value={formData.address.zipCode}
                    onChange={(e) => handleInputChange('address.zipCode', e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Business Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Business Information
              </CardTitle>
              <CardDescription>Optional business details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    value={formData.businessInfo?.businessName || ''}
                    onChange={(e) => handleInputChange('businessInfo.businessName', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <Input
                    id="licenseNumber"
                    value={formData.businessInfo?.licenseNumber || ''}
                    onChange={(e) => handleInputChange('businessInfo.licenseNumber', e.target.value)}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="insuranceInfo">Insurance Information</Label>
                <Textarea
                  id="insuranceInfo"
                  placeholder="Describe your insurance coverage"
                  value={formData.businessInfo?.insuranceInfo || ''}
                  onChange={(e) => handleInputChange('businessInfo.insuranceInfo', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* References */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                References
              </CardTitle>
              <CardDescription>Professional references (optional but recommended)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.references!.map((ref, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Reference {index + 1}</h4>
                    {formData.references!.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeReference(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`ref-name-${index}`}>Name</Label>
                      <Input
                        id={`ref-name-${index}`}
                        value={ref.name}
                        onChange={(e) => handleReferenceChange(index, 'name', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`ref-contact-${index}`}>Contact</Label>
                      <Input
                        id={`ref-contact-${index}`}
                        value={ref.contact}
                        onChange={(e) => handleReferenceChange(index, 'contact', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`ref-relationship-${index}`}>Relationship</Label>
                      <Input
                        id={`ref-relationship-${index}`}
                        placeholder="e.g., Previous Employer"
                        value={ref.relationship}
                        onChange={(e) => handleReferenceChange(index, 'relationship', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <Button
                type="button"
                variant="outline"
                onClick={addReference}
                className="w-full"
              >
                Add Reference
              </Button>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Submit Registration
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

