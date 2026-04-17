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

    // Google Maps Review Link — GroundOps business listing
    const googleReviewLink = 'https://www.google.com/maps/place/GroundOps/@39.7816313,-84.3525318,54392m/data=!3m1!1e3!4m6!3m5!1s0xcf3cf46f3c896d:0x703abfeed5a9061f!8m2!3d33.894974!4d-96.6078334!16s%2Fg%2F11n4p2d3c8?entry=ttu&g_ep=EgoyMDI2MDQxNS4wIKXMDSoASAFQAw%3D%3D';

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
