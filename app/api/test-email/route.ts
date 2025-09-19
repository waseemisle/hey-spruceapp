import { NextRequest, NextResponse } from 'next/server'
import { sendApprovalEmail, verifyEmailConfig } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    // Verify email configuration first
    const configValid = await verifyEmailConfig()
    
    if (!configValid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email configuration is invalid. Please check your SMTP settings.' 
        },
        { status: 500 }
      )
    }

    const { testEmail, clientName, companyName } = await request.json()

    if (!testEmail) {
      return NextResponse.json(
        { error: 'Test email address is required' },
        { status: 400 }
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
      return NextResponse.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      })
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to send test email',
          details: result.error 
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Test email error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const configValid = await verifyEmailConfig()
    
    return NextResponse.json({
      success: configValid,
      message: configValid 
        ? 'Email configuration is valid' 
        : 'Email configuration is invalid',
      smtpHost: process.env.SMTP_HOST || 'Not set',
      smtpUser: process.env.SMTP_USER ? 'Set' : 'Not set',
      smtpPass: process.env.SMTP_PASS ? 'Set' : 'Not set'
    })
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to verify email configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
