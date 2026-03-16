import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, alertBox, ctaButton } from '@/lib/email-template';

/**
 * POST /api/email/send-test
 * Sends a test email to verify Mailgun is configured.
 * Body: { "to": "optional@email.com" } — defaults to waseemisle@gmail.com
 */
export async function POST(request: Request) {
  try {
    let to = 'waseemisle@gmail.com';
    try {
      const body = await request.json().catch(() => ({}));
      if (body?.to && typeof body.to === 'string') to = body.to;
    } catch {
      // use default
    }

    const emailHtml = emailLayout({
      title: 'GroundOps Test Email',
      preheader: 'Your email configuration is working correctly',
      body: `
        ${alertBox('<strong>Success!</strong> Mailgun/Resend is configured correctly and emails are working.', 'success')}
        <p style="color:#5A6C7A;margin:20px 0;">This is a test email from your GroundOps application.</p>
        <p style="color:#5A6C7A;margin:0;">Sent at: ${new Date().toISOString()}</p>
        ${ctaButton('Visit GroundOps', process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app')}
      `,
    });

    await sendEmail({
      to,
      subject: 'GroundOps – Test email',
      html: emailHtml,
    });
    await logEmail({ type: 'test', to, subject: 'GroundOps – Test email', status: 'sent', context: {} });

    return NextResponse.json({ success: true, message: `Test email sent to ${to}` });
  } catch (error: any) {
    console.error('Send test email error:', error);
    const message = error?.message || String(error);
    const isConfig = message.includes('RESEND') || message.includes('not configured');
    await logEmail({ type: 'test', to: 'waseemisle@gmail.com', subject: 'GroundOps – Test email', status: 'failed', context: {}, error: message });
    return NextResponse.json(
      { success: false, error: message },
      { status: isConfig ? 500 : 500 }
    );
  }
}
