'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/lib/auth'
import { demoUsers } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import Logo from '@/components/ui/logo'

interface PortalOption {
  value: string
  label: string
  icon: string
  description: string
}

const portalOptions: PortalOption[] = [
  {
    value: 'client',
    label: 'Client',
    icon: '🏢',
    description: 'Property Management'
  },
  {
    value: 'admin',
    label: 'Admin',
    icon: '👤',
    description: 'System Administration'
  },
  {
    value: 'subcontractor',
    label: 'Subcontractor',
    icon: '🔧',
    description: 'Service Provider'
  }
]

const demoCredentials = demoUsers.map(user => ({
  email: user.email,
  password: user.password,
  portal: user.role,
  label: user.role.charAt(0).toUpperCase() + user.role.slice(1)
}))

export default function PortalLogin() {
  const router = useRouter()
  const { signIn, resetPassword } = useAuth()
  
  const [selectedPortal, setSelectedPortal] = useState('client')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    // Load remembered credentials
    const rememberedEmail = localStorage.getItem('rememberedEmail')
    const rememberedPortal = localStorage.getItem('rememberedPortal')
    
    if (rememberedEmail) {
      setEmail(rememberedEmail)
      setRemember(true)
    }
    
    if (rememberedPortal) {
      setSelectedPortal(rememberedPortal)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('Logging in...')

    try {
      await signIn(email, password, selectedPortal)
      
      // Store preferences if remember is checked
      if (remember) {
        localStorage.setItem('rememberedEmail', email)
        localStorage.setItem('rememberedPortal', selectedPortal)
      } else {
        localStorage.removeItem('rememberedEmail')
        localStorage.removeItem('rememberedPortal')
      }

      // Store portal preference
      localStorage.setItem('lastPortal', selectedPortal)

      setSuccess('Login successful! Redirecting...')
      
      // Reduced timeout from 500ms to 2000ms (2 seconds)
      setTimeout(() => {
        switch (selectedPortal) {
          case 'client':
            router.push('/client-portal')
            break
          case 'admin':
            router.push('/admin-portal')
            break
          case 'subcontractor':
            router.push('/subcontractor-portal')
            break
        }
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Invalid email or password. Please try again.')
      setSuccess('')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.')
      return
    }

    try {
      await resetPassword(email)
      setSuccess(`Password reset instructions have been sent to ${email}`)
      setError('')
      
      setTimeout(() => {
        setSuccess('')
      }, 5000)
    } catch (err: any) {
      setError('Error sending reset email: ' + err.message)
    }
  }

  const handleSignupRequest = () => {
    let message = ''
    
    switch (selectedPortal) {
      case 'client':
        message = 'To request client access, please contact your account manager or call 877-253-2646.'
        break
      case 'admin':
        message = 'Admin access is restricted. Please contact your system administrator.'
        break
      case 'subcontractor':
        message = 'To become a Hey Spruce subcontractor partner, please contact us at partners@heyspruce.com or call 877-253-2646.'
        break
    }
    
    setSuccess(message)
    setTimeout(() => {
      setSuccess('')
    }, 7000)
  }

  const fillDemoCredentials = (cred: { email: string; password: string; portal: string }) => {
    setEmail(cred.email)
    setPassword(cred.password)
    setSelectedPortal(cred.portal)
  }

  return (
    <div className="min-h-screen portal-gradient">
      {/* Background shapes */}
      <div className="bg-shape"></div>
      <div className="bg-shape"></div>
      <div className="bg-shape"></div>
      
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-4xl">
          <Card className="overflow-hidden shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Left side - Login Form */}
              <div className="p-8 lg:p-12">
                <div className="mb-8 flex justify-center">
                  <Logo size="2xl" />
                </div>
                
                <p className="text-gray-600 mb-6">Property Maintenance Solutions Portal</p>
                
                {/* Demo Credentials */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <h4 className="text-yellow-800 font-semibold mb-2 text-sm">ℹ️ Login Information</h4>
                  <div className="text-yellow-700 text-sm space-y-2">
                    <p><strong>Use your existing account or create one in Supabase.</strong></p>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-semibold">Setup Demo Accounts (Optional)</summary>
                      <div className="mt-2 pl-2 space-y-1">
                        <p>1. Check DEMO-SETUP-GUIDE.md for instructions</p>
                        <p>2. Run diagnose-setup.sql to check your database</p>
                        <p>3. Create users in Supabase Dashboard</p>
                        <div className="mt-2 p-2 bg-white rounded border">
                          {demoCredentials.map((cred) => (
                            <div
                              key={cred.portal}
                              className="cursor-pointer py-1 hover:bg-gray-50 rounded px-2"
                              onClick={() => fillDemoCredentials(cred)}
                            >
                              <strong>{cred.label}:</strong> {cred.email} / {cred.password}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                    {error}
                  </div>
                )}
                
                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
                    {success}
                  </div>
                )}
                
                <form onSubmit={handleLogin} className="space-y-6">
                  {/* Portal Selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Select Your Portal</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {portalOptions.map((option) => (
                        <div key={option.value} className="relative">
                          <input
                            type="radio"
                            name="portal"
                            value={option.value}
                            id={option.value}
                            checked={selectedPortal === option.value}
                            onChange={(e) => setSelectedPortal(e.target.value)}
                            className="sr-only"
                          />
                          <label
                            htmlFor={option.value}
                            className={cn(
                              "flex flex-col items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-primary hover:-translate-y-0.5 hover:shadow-md",
                              selectedPortal === option.value
                                ? "border-primary bg-primary/5"
                                : "border-gray-200 bg-white"
                            )}
                          >
                            <div className="text-3xl mb-2">{option.icon}</div>
                            <div className="text-sm font-semibold text-gray-900">{option.label}</div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Email Input */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  
                  {/* Password Input */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  
                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember"
                        checked={remember}
                        onCheckedChange={(checked) => setRemember(checked === true)}
                      />
                      <Label htmlFor="remember" className="text-sm">Keep me signed in</Label>
                    </div>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-primary hover:underline text-sm font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  
                  {/* Login Button */}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-semibold"
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
                
                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-4 text-gray-500">OR</span>
                  </div>
                </div>
                
                {/* Signup Link */}
                <div className="text-center text-sm text-gray-600">
                  New to Spruce App?{' '}
                  <a
                    href="/register"
                    className="text-primary hover:underline font-semibold"
                  >
                    Register as Client
                  </a>
                  {' '}or{' '}
                  <button
                    onClick={handleSignupRequest}
                    className="text-primary hover:underline font-semibold"
                  >
                    Request Access
                  </button>
                </div>
              </div>
              
              {/* Right side - Welcome Message */}
              <div className="admin-gradient text-white p-8 lg:p-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-lg"></div>
                <div className="relative z-10">
                  <h2 className="text-3xl font-bold mb-4">Welcome Back!</h2>
                  <p className="text-lg opacity-90 mb-8 text-center">
                    Access your personalized portal to manage properties, work orders, and more.
                  </p>
                  
                  <ul className="space-y-4 mb-8">
                    {[
                      'Manage work orders & service requests',
                      'Track equipment maintenance',
                      'Submit & review proposals',
                      'Real-time notifications'
                    ].map((feature, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">
                          ✓
                        </div>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6">
                    <h3 className="text-xl font-semibold mb-2">Need Help?</h3>
                    <p className="text-sm opacity-90 leading-relaxed">
                      Contact our support team at<br />
                      📞 877-253-2646<br />
                      ✉️ support@heyspruce.com
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
