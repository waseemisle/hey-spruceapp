import nodemailer from 'nodemailer'

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
}

// Create transporter
const transporter = nodemailer.createTransport(emailConfig)

// Verify transporter configuration
export async function verifyEmailConfig() {
  try {
    await transporter.verify()
    console.log('Email server is ready to send messages')
    return true
  } catch (error) {
    console.error('Email server configuration error:', error)
    return false
  }
}

// Send approval email to client
export async function sendApprovalEmail(
  clientEmail: string,
  clientName: string,
  companyName: string,
  loginUrl: string
) {
  try {
    const mailOptions = {
      from: `"Spruce App" <${process.env.SMTP_USER || 'noreply@heyspruce.com'}>`,
      to: clientEmail,
      subject: '🎉 Your Spruce App Access Has Been Approved!',
      html: generateApprovalEmailHTML(clientName, companyName, loginUrl, clientEmail),
      text: generateApprovalEmailText(clientName, companyName, loginUrl, clientEmail),
    }

    const result = await transporter.sendMail(mailOptions)
    console.log('Approval email sent successfully:', result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error('Error sending approval email:', error)
    return { success: false, error: error }
  }
}

// Generate HTML email template
function generateApprovalEmailHTML(
  clientName: string,
  companyName: string,
  loginUrl: string,
  clientEmail: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Spruce App</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8fafc;
        }
        .container {
          background-color: white;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #2563eb;
          margin-bottom: 10px;
        }
        .title {
          color: #059669;
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .content {
          margin-bottom: 30px;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 16px;
          text-align: center;
          margin: 20px 0;
          transition: transform 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
        }
        .features {
          background-color: #f8fafc;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .features ul {
          list-style: none;
          padding: 0;
        }
        .features li {
          padding: 8px 0;
          padding-left: 30px;
          position: relative;
        }
        .features li:before {
          content: "✓";
          position: absolute;
          left: 0;
          color: #059669;
          font-weight: bold;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
        .contact-info {
          background-color: #eff6ff;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🌲 Spruce App</div>
          <div class="title">Welcome Aboard!</div>
        </div>
        
        <div class="content">
          <p>Dear ${clientName},</p>
          
          <p>Great news! Your registration for <strong>${companyName}</strong> has been approved by our admin team. You now have full access to the Spruce App platform!</p>
          
          <p>Spruce App provides comprehensive property maintenance solutions to help you manage your properties efficiently. You can now:</p>
          
          <div class="features">
            <ul>
              <li>Create and manage work orders</li>
              <li>Track maintenance schedules</li>
              <li>Submit service requests</li>
              <li>Review proposals from contractors</li>
              <li>Monitor property status in real-time</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" class="button">🚀 Access Your Portal</a>
          </div>
          
          <p><strong>Login Details:</strong></p>
          <ul>
            <li>Portal: Client Portal</li>
            <li>Email: ${clientEmail}</li>
            <li>Use the password you set during registration</li>
          </ul>
          
          <div class="contact-info">
            <p><strong>Need Help?</strong></p>
            <p>Our support team is here to assist you:</p>
            <p>📞 Phone: 877-253-2646<br>
            ✉️ Email: support@heyspruce.com</p>
          </div>
        </div>
        
        <div class="footer">
          <p>Thank you for choosing Spruce App for your property maintenance needs!</p>
          <p>© 2024 Spruce App. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email template
function generateApprovalEmailText(
  clientName: string,
  companyName: string,
  loginUrl: string,
  clientEmail: string
): string {
  return `
Welcome to Spruce App!

Dear ${clientName},

Great news! Your registration for ${companyName} has been approved by our admin team. You now have full access to the Spruce App platform!

Spruce App provides comprehensive property maintenance solutions to help you manage your properties efficiently.

LOGIN NOW:
${loginUrl}

Login Details:
- Portal: Client Portal
- Email: ${clientEmail}
- Use the password you set during registration

What you can do:
✓ Create and manage work orders
✓ Track maintenance schedules
✓ Submit service requests
✓ Review proposals from contractors
✓ Monitor property status in real-time

Need Help?
Our support team is here to assist you:
📞 Phone: 877-253-2646
✉️ Email: support@heyspruce.com

Thank you for choosing Spruce App for your property maintenance needs!

© 2024 Spruce App. All rights reserved.
  `
}
