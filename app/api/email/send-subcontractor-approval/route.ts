import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';

export async function POST(request: NextRequest) {
  try {
    const {
      toEmail,
      toName,
      businessName,
      approvedBy,
      portalLink
    } = await request.json();

    // Validate required fields
    if (!toEmail || !toName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Account Approved</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">✓ Account Approved!</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${toName}${businessName ? ` (${businessName})` : ''},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! Your Hey Spruce subcontractor account has been approved${approvedBy ? ` by ${approvedBy}` : ''}.
            </p>

            <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <p style="margin: 0; font-size: 16px; color: #065f46;">
                <strong>✓ You can now access the Subcontractor Portal</strong>
              </p>
            </div>

            <p style="font-size: 16px; margin-bottom: 30px;">
              Login to your account to:
            </p>

            <ul style="font-size: 16px; margin-bottom: 30px; padding-left: 20px;">
              <li style="margin-bottom: 10px;">View and bid on available work orders</li>
              <li style="margin-bottom: 10px;">Submit quotes for projects</li>
              <li style="margin-bottom: 10px;">Track your assigned work orders</li>
              <li style="margin-bottom: 10px;">Communicate with clients and administrators</li>
              <li style="margin-bottom: 10px;">Manage your business profile and skills</li>
            </ul>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${portalLink || `${process.env.NEXT_PUBLIC_APP_URL}/portal-login`}"
                 style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        display: inline-block;">
                Login to Subcontractor Portal
              </a>
            </div>

            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #3b82f6;">
              <p style="margin: 0; font-size: 14px; color: #1e40af;">
                <strong>💡 Need Help?</strong> If you have any questions or need assistance, please don't hesitate to contact our support team.
              </p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
            <p>© ${new Date().getFullYear()} Hey Spruce. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    // Send email via Mailgun
    await sendEmail({
      to: toEmail,
      subject: 'Your Hey Spruce Subcontractor Account Has Been Approved!',
      html: emailHtml,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('❌ Error sending subcontractor approval email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('MAILGUN');
    
    return NextResponse.json(
      {
        error: 'Failed to send subcontractor approval email',
        details: errorMessage,
        configError: isConfigError,
        suggestion: isConfigError
          ? 'Please configure MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL environment variables.'
          : undefined
      },
      { status: 500 }
    );
  }
}

