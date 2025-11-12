import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, role, resetLink } = await request.json();

    // Validate required fields
    if (!email || !fullName || !role || !resetLink) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'waseem@shurehw.com';

    // If no SendGrid API key, log to console (test mode)
    if (!SENDGRID_API_KEY) {
      console.log('SendGrid not configured. Email would be sent to:', email);
      console.log('Reset link:', resetLink);
      return NextResponse.json({
        success: true,
        message: 'Test mode: Email logged to console'
      });
    }

    // Determine role-specific content
    const roleTitle = role === 'subcontractor' ? 'Subcontractor' :
                     role === 'client' ? 'Client' : 'Admin User';

    const portalName = role === 'subcontractor' ? 'Subcontractor Portal' :
                      role === 'client' ? 'Client Portal' : 'Admin Portal';

    // Create email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Hey Spruce</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Hey Spruce!</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${fullName},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              You've been invited to join Hey Spruce as a <strong>${roleTitle}</strong>.
              To get started, you'll need to set up your password.
            </p>

            <p style="font-size: 16px; margin-bottom: 30px;">
              Click the button below to create your password and activate your account:
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}"
                 style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        display: inline-block;">
                Set Up Password
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Or copy and paste this link into your browser:
            </p>
            <p style="font-size: 14px; color: #10b981; word-break: break-all;">
              ${resetLink}
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">
              <strong>Your Account Details:</strong>
            </p>
            <ul style="font-size: 14px; color: #6b7280;">
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Role:</strong> ${roleTitle}</li>
              <li><strong>Portal:</strong> ${portalName}</li>
            </ul>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Once you've set your password, you can log in at:
              <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/portal-login"
                 style="color: #10b981; text-decoration: none;">
                ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/portal-login
              </a>
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
              If you didn't expect this invitation, you can safely ignore this email.
              This link will expire in 24 hours.
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} Hey Spruce. All rights reserved.</p>
            <p>Shure Hardware - Professional Property Management Solutions</p>
          </div>
        </body>
      </html>
    `;

    // Send email via SendGrid
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email }],
            subject: `Welcome to Hey Spruce - Set Up Your ${roleTitle} Account`,
          },
        ],
        from: {
          email: SENDGRID_FROM_EMAIL,
          name: 'Hey Spruce',
        },
        content: [
          {
            type: 'text/html',
            value: emailHtml,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SendGrid error:', errorText);
      throw new Error(`SendGrid API error: ${response.status}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation email sent successfully'
    });

  } catch (error) {
    console.error('Error sending invitation email:', error);
    return NextResponse.json(
      { error: 'Failed to send invitation email' },
      { status: 500 }
    );
  }
}
