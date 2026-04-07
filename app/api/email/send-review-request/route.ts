import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, ctaButton } from '@/lib/email-template';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      toEmail,
      toName,
      workOrderNumber,
    } = body;

    // Google Maps Review Link
    const googleReviewLink = 'https://www.google.com/maps/place/Spruce+Cleaning+%26+Maintenance/@34.0204789,-118.4117326,10z/data=!3m1!4b1!4m6!3m5!1s0x20a5e683df0722d:0x409439675ca2c8b!8m2!3d34.020479!4d-118.4117326!16s%2Fg%2F11xw24xtqb?entry=ttu&g_ep=EgoyMDI1MTExNy4wIKXMDSoASAFQAw%3D%3D';

    const emailHtml = emailLayout({
      title: 'How Was Your Service?',
      preheader: 'Please rate your recent service with GroundOps',
      body: `
        <p style="margin:0 0 20px 0;">Hi ${toName || 'there'},</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">We hope your recent service (Work Order <strong>${workOrderNumber}</strong>) went smoothly. Your feedback helps us improve!</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${googleReviewLink}" style="text-decoration:none;">
            <div style="font-size:40px;letter-spacing:4px;margin-bottom:12px;">★★★★★</div>
            <p style="margin:0;color:#5A6C7A;font-size:14px;">Tap the stars to leave a review</p>
          </a>
        </div>
        ${ctaButton('Leave a Review on Google', googleReviewLink)}
        <p style="margin:24px 0 0 0;font-size:13px;color:#8A9CAB;text-align:center;">Thank you for choosing GroundOps for your facility maintenance needs.</p>
      `,
    });

    await sendEmail({
      to: toEmail,
      subject: `How was your service with GroundOps? - Work Order ${workOrderNumber}`,
      html: emailHtml,
    });
    await logEmail({ type: 'review-request', to: toEmail, subject: `How was your service with GroundOps? - Work Order ${workOrderNumber}`, status: 'sent', context: { toName, workOrderNumber } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending review request email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');
    await logEmail({ type: 'review-request', to: '', subject: '', status: 'failed', context: {}, error: error.message || String(error) }).catch(() => {});

    return NextResponse.json(
      {
        error: 'Failed to send review request email',
        details: errorMessage,
        configError: isConfigError,
        suggestion: isConfigError
          ? 'Please configure RESEND_API_KEY and FROM_EMAIL environment variables.'
          : undefined
      },
      { status: 500 }
    );
  }
}
