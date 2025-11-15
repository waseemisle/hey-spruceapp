import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: NextRequest) {
  try {
    const {
      toEmail,
      toName,
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

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'matthew@heyspruce.com';

    // If no Resend API key, log to console (test mode)
    if (!RESEND_API_KEY) {
      console.log('\n========================================');
      console.log('📧 CLIENT APPROVAL EMAIL (TEST MODE)');
      console.log('========================================');
      console.log('To:', toEmail);
      console.log('Name:', toName);
      console.log('Approved By:', approvedBy);
      console.log('\n⚠️  Resend not configured - Add RESEND_API_KEY to environment variables');
      console.log('========================================\n');
      return NextResponse.json({
        success: true,
        message: 'Test mode: Email logged to console'
      });
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
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${toName},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              Great news! Your Hey Spruce account has been approved${approvedBy ? ` by ${approvedBy}` : ''}.
            </p>

            <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <p style="margin: 0; font-size: 16px; color: #065f46;">
                <strong>✓ You can now access the Client Portal</strong>
              </p>
            </div>

            <p style="font-size: 16px; margin-bottom: 30px;">
              Login to your account to:
            </p>

            <ul style="font-size: 16px; margin-bottom: 30px; padding-left: 20px;">
              <li style="margin-bottom: 10px;">View and manage work orders</li>
              <li style="margin-bottom: 10px;">Review and approve quotes from contractors</li>
              <li style="margin-bottom: 10px;">Track the status of ongoing projects</li>
              <li style="margin-bottom: 10px;">Communicate with your service providers</li>
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
                Login to Client Portal
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

    // Send email via Resend
    const resend = new Resend(RESEND_API_KEY);

    const data = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: toEmail,
      subject: 'Your Hey Spruce Account Has Been Approved!',
      html: emailHtml,
    });

    return NextResponse.json({
      success: true,
      messageId: (data as any).id,
    });
  } catch (error: any) {
    console.error('Error sending client approval email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
