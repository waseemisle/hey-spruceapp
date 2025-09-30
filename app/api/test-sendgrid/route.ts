// Using standard Response instead of NextResponse to avoid type issues
import nodemailer from 'nodemailer'

// Create transporter using your SMTP configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'matthew@heyspruce.com',
    pass: process.env.SMTP_PASSWORD || 'uxsbqyqgqooqlrhs'
  },
  tls: {
    rejectUnauthorized: false
  }
})

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('Testing SMTP connection with email:', email)

    // Test with a simple email
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'matthew@heyspruce.com',
      to: email,
      subject: 'Test Email from Spruce App',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>Test Email</h1>
          <p>This is a test email to verify SMTP is working.</p>
          <p>If you receive this, the email service is functioning correctly.</p>
        </div>
      `
    }

    const result = await transporter.sendMail(mailOptions)
    console.log('SMTP test result:', result)

    return new Response(
        JSON.stringify({
      success: true,
      data: { messageId: result.messageId },
      message: 'Test email sent successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('SendGrid test error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Failed to send test email', 
        details: error.message,
        fullError: JSON.stringify(error, null, 2)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
