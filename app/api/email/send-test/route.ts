import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/nodemailer';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Test email endpoint - use POST method to send emails',
    usage: 'POST /api/email/send-test with body: { "toEmail": "recipient@example.com" }'
  });
}

export async function POST(request: NextRequest) {
  try {
    const { toEmail } = await request.json();

    if (!toEmail) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      );
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test Email</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Test Email</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello!</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              This is a test email from Hey Spruce App using <strong>Nodemailer</strong>.
            </p>

            <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <p style="margin: 0; font-size: 16px; color: #065f46;">
                <strong>✓ Email Configuration Working!</strong>
              </p>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #047857;">
                Your Nodemailer setup is configured correctly and emails are being sent from <strong>matthew@heyspruce.com</strong>
              </p>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Test email sent at: ${new Date().toLocaleString()}
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} Hey Spruce. All rights reserved.</p>
            <p>Shure Hardware - Professional Property Management Solutions</p>
          </div>
        </body>
      </html>
    `;

    const result = await sendEmail({
      to: toEmail,
      subject: 'Test Email from Hey Spruce - Nodemailer Setup',
      html: emailHtml,
    });

    return NextResponse.json({
      success: true,
      message: 'Test email sent successfully',
      testMode: result.testMode,
      messageId: result.messageId,
    });

  } catch (error: any) {
    console.error('Error sending test email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send test email' },
      { status: 500 }
    );
  }
}
