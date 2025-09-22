'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function TestEmailPage() {
  const [email, setEmail] = useState('waseem@shurehw.com')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const testResend = async () => {
    console.log('Testing Resend with email:', email)
    if (!email) {
      console.log('No email provided')
      return
    }
    
    setLoading(true)
    setResult(null)
    
    try {
      console.log('Sending request to /api/test-resend')
      const response = await fetch('/api/test-resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      
      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)
      setResult(data)
    } catch (error) {
      console.error('Error in testResend:', error)
      setResult({ error: 'Failed to send test email', details: error })
    } finally {
      setLoading(false)
    }
  }

        const testWorkOrderEmail = async () => {
          console.log('Testing Work Order Email with email:', email)
          if (!email) {
            console.log('No email provided')
            return
          }
          
          setLoading(true)
          setResult(null)
          
          try {
            console.log('Sending request to /api/test-workorder-email')
            const response = await fetch('/api/test-workorder-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ clientEmail: email }),
            })
            
            console.log('Response status:', response.status)
            const data = await response.json()
            console.log('Response data:', data)
            setResult(data)
          } catch (error) {
            console.error('Error in testWorkOrderEmail:', error)
            setResult({ error: 'Failed to send test work order email', details: error })
          } finally {
            setLoading(false)
          }
        }

        const testSendGrid = async () => {
          console.log('Testing SendGrid with email:', email)
          if (!email) {
            console.log('No email provided')
            return
          }
          
          setLoading(true)
          setResult(null)
          
          try {
            console.log('Sending request to /api/test-sendgrid')
            const response = await fetch('/api/test-sendgrid', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email }),
            })
            
            console.log('Response status:', response.status)
            const data = await response.json()
            console.log('Response data:', data)
            setResult(data)
          } catch (error) {
            console.error('Error in testSendGrid:', error)
            setResult({ error: 'Failed to send test SendGrid email', details: error })
          } finally {
            setLoading(false)
          }
        }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Email Testing</CardTitle>
          <CardDescription>
            Test the email functionality to debug work order approval emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
            />
            <p className="text-sm text-gray-500 mt-1">
              Current email: {email || 'No email entered'}
            </p>
          </div>
          
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    onClick={testResend} 
                    disabled={loading || !email}
                    variant="outline"
                  >
                    {loading ? 'Testing...' : 'Test Nodemailer'}
                  </Button>
                  
                  <Button 
                    onClick={testSendGrid} 
                    disabled={loading || !email}
                    variant="outline"
                  >
                    {loading ? 'Testing...' : 'Test SendGrid'}
                  </Button>
                  
                  <Button 
                    onClick={testWorkOrderEmail} 
                    disabled={loading || !email}
                  >
                    {loading ? 'Testing...' : 'Test Work Order Email'}
                  </Button>
                </div>
          
          <div className="text-sm text-gray-600">
            <p>Button disabled: {loading ? 'Yes (loading)' : !email ? 'Yes (no email)' : 'No'}</p>
            <p>Email length: {email.length}</p>
            <p>Loading: {loading ? 'Yes' : 'No'}</p>
          </div>
          
          {result && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <h3 className="font-semibold mb-2">Result:</h3>
              <pre className="text-sm overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
