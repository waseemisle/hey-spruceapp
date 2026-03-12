import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';
import { logEmail } from '@/lib/email-logger';

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

    await sendEmail({
      to,
      subject: 'GroundOps – Test email',
      html: `
        <p>This is a test email from your GroundOps app.</p>
        <p>If you received this, Mailgun is configured correctly.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `,
    });
    await logEmail({ type: 'test', to, subject: 'GroundOps – Test email', status: 'sent', context: {} });

    return NextResponse.json({ success: true, message: `Test email sent to ${to}` });
  } catch (error: any) {
    console.error('Send test email error:', error);
    const message = error?.message || String(error);
    const isConfig = message.includes('MAILGUN') || message.includes('not configured');
    await logEmail({ type: 'test', to: 'waseemisle@gmail.com', subject: 'GroundOps – Test email', status: 'failed', context: {}, error: message });
    return NextResponse.json(
      { success: false, error: message },
      { status: isConfig ? 500 : 500 }
    );
  }
}
