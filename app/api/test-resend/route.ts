// Using standard Response instead of NextResponse to avoid type issues
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'waseemisle@gmail.com',
    pass: process.env.SMTP_PASS || 'ideas927336' // This should be an App Password, not regular password
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

    console.log('Testing Nodemailer connection with email:', email)

    // Test with a simple email
    const mailOptions = {
      from: 'Spruce App <waseemisle@gmail.com>',
      to: email,
      subject: 'Test Email from Spruce App',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>Test Email</h1>
          <p>This is a test email to verify Nodemailer is working.</p>
          <p>If you receive this, the email service is functioning correctly.</p>
        </div>
      `
    }

    const result = await transporter.sendMail(mailOptions)
    console.log('Nodemailer test result:', result)

    return new Response(
        JSON.stringify({
      success: true,
      data: { messageId: result.messageId },
      message: 'Test email sent successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Resend test error:', error)
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to send test email',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
