// Using standard Response instead of NextResponse to avoid type issues
import { sendApprovalEmail, verifyEmailConfig } from '@/lib/email'

export async function POST(request: Request) {
  try {
    // Verify email configuration first
    const configValid = await verifyEmailConfig()
    
    if (!configValid) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Email configuration is invalid. Please check your SMTP settings.' 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { testEmail, clientName, companyName } = await request.json()

    if (!testEmail) {
      return new Response(
        JSON.stringify({ error: 'Test email address is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal-login`
    
    const result = await sendApprovalEmail(
      testEmail,
      clientName || 'Test Client',
      companyName || 'Test Company',
      loginUrl
    )

    if (result.success) {
      return new Response(
        JSON.stringify({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to send test email',
          details: result.error 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Test email error:', error)
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function GET() {
  try {
    const configValid = await verifyEmailConfig()
    
    return new Response(
        JSON.stringify({
      success: configValid,
      message: configValid 
        ? 'Email configuration is valid' 
        : 'Email configuration is invalid',
      smtpHost: process.env.SMTP_HOST || 'Not set',
      smtpUser: process.env.SMTP_USER ? 'Set' : 'Not set',
      smtpPass: process.env.SMTP_PASS ? 'Set' : 'Not set'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  } catch (error) {
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to verify email configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
