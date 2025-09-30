'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  ExternalLink as LinkIcon,
  Copy,
  Mail,
  MessageSquare,
  ArrowLeft,
  CheckCircle,
  Calendar,
  Clock
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface GeneratedLink {
  id: string
  link: string
  clientEmail: string
  clientName: string
  status: 'active' | 'used' | 'expired'
  createdAt: string
  expiresAt: string
  usedAt?: string
  usedBy?: string
}

// Mock data for demonstration
const mockGeneratedLinks: GeneratedLink[] = [
  {
    id: '1',
    link: 'https://localhost:3000/register?token=abc123',
    clientEmail: 'john@acmepm.com',
    clientName: 'John Smith - Acme PM',
    status: 'used',
    createdAt: '2024-01-15T10:30:00.000Z',
    expiresAt: '2024-01-22T10:30:00.000Z',
    usedAt: '2024-01-16T14:20:00.000Z',
    usedBy: 'john@acmepm.com'
  },
  {
    id: '2',
    link: 'https://localhost:3000/register?token=def456',
    clientEmail: 'sarah@techcorp.com',
    clientName: 'Sarah Johnson - Tech Corp',
    status: 'active',
    createdAt: '2024-01-16T09:15:00.000Z',
    expiresAt: '2024-01-23T09:15:00.000Z'
  }
]

export default function GenerateLinkPage() {
  const router = useRouter()
  const [clientEmail, setClientEmail] = useState('')
  const [clientName, setClientName] = useState('')
  const [expirationDays, setExpirationDays] = useState(7)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>(mockGeneratedLinks)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  const generateUniqueToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  const handleGenerateLink = async () => {
    if (!clientEmail || !clientName) {
      alert('Please fill in all required fields')
      return
    }

    setIsGenerating(true)

    try {
      const response = await fetch('/api/admin/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientEmail,
          clientName,
          expirationDays
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedLink(data.registrationUrl)

        // Add to generated links list
        const newLink: GeneratedLink = {
          id: data.linkId,
          link: data.registrationUrl,
          clientEmail,
          clientName,
          status: 'active',
          createdAt: new Date().toISOString(),
          expiresAt: data.expiresAt
        }

        setGeneratedLinks(prev => [newLink, ...prev])
      } else {
        const error = await response.json()
        alert('Failed to generate link: ' + error.error)
      }

    } catch (error) {
      console.error('Error generating link:', error)
      alert('Failed to generate link. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedLink(link)
      setTimeout(() => setCopiedLink(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = link
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedLink(link)
      setTimeout(() => setCopiedLink(null), 2000)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'used':
        return <Badge className="bg-blue-100 text-blue-800">Used</Badge>
      case 'expired':
        return <Badge className="bg-red-100 text-red-800">Expired</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const sendViaEmail = (link: string, email: string) => {
    const subject = 'Spruce App - Client Registration Invitation'
    const body = `Dear Client,

You have been invited to register for Spruce App services. Please click the link below to complete your registration:

${link}

This link will expire in ${expirationDays} days.

Best regards,
Spruce App Team`

    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailtoLink)
  }

  const sendViaWhatsApp = (link: string, clientName: string) => {
    const message = `Hi ${clientName}! You've been invited to register for Spruce App services. Please complete your registration here: ${link}`
    const whatsappLink = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappLink, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Client Management
          </Button>
          <h1 className="text-3xl font-bold">Generate Registration Link</h1>
          <p className="text-gray-600 mt-2">Create and send registration links to new clients</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Link Generation Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Generate New Link
            </CardTitle>
            <CardDescription>
              Create a personalized registration link for a new client
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="clientEmail">Client Email *</Label>
              <Input
                id="clientEmail"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name/Company *</Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="John Smith - Acme Property Management"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expirationDays">Link Expiration (Days)</Label>
              <Input
                id="expirationDays"
                type="number"
                min="1"
                max="30"
                value={expirationDays}
                onChange={(e) => setExpirationDays(parseInt(e.target.value) || 7)}
              />
              <p className="text-sm text-gray-500">
                Link will expire in {expirationDays} day{expirationDays !== 1 ? 's' : ''}
              </p>
            </div>

            <Button
              onClick={handleGenerateLink}
              disabled={isGenerating || !clientEmail || !clientName}
              className="w-full"
            >
              {isGenerating ? 'Generating...' : 'Generate Registration Link'}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Link Display */}
        {generatedLink && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Link Generated Successfully!
              </CardTitle>
              <CardDescription>
                Your registration link has been created and is ready to share
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Registration Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={generatedLink}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(generatedLink)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Share via:</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendViaEmail(generatedLink, clientEmail)}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendViaWhatsApp(generatedLink, clientName)}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generatedLink, '_blank')}
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Open Link
                  </Button>
                </div>
              </div>

              {copiedLink && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-800">✓ Link copied to clipboard!</p>
                </div>
              )}

              <Button
                variant="ghost"
                onClick={() => {
                  setGeneratedLink(null)
                  setClientEmail('')
                  setClientName('')
                }}
                className="w-full"
              >
                Generate Another Link
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Generated Links History */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Links History</CardTitle>
          <CardDescription>
            Track all registration links you've created
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {generatedLinks.map((link) => (
              <div key={link.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">{link.clientName}</h3>
                      {getStatusBadge(link.status)}
                    </div>
                    <p className="text-sm text-gray-600">{link.clientEmail}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created: {formatDate(link.createdAt)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expires: {formatDate(link.expiresAt)}
                      </div>
                      {link.usedAt && (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Used: {formatDate(link.usedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(link.link)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(link.link, '_blank')}
                    >
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {generatedLinks.length === 0 && (
              <div className="text-center py-8">
                <LinkIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No links generated yet</h3>
                <p className="text-gray-500">Generate your first registration link above</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
