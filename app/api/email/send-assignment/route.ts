import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
    const { toEmail, toName, workOrderNumber, workOrderTitle, clientName, locationName, locationAddress } = body;

    const emailHtml = emailLayout({
      title: 'Work Order Assigned to You',
      preheader: `You've been assigned to work order ${workOrderNumber} — ${workOrderTitle}`,
      body: `
        <p style="margin:0 0 20px 0;">Hi <strong>${toName}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">The client has approved your quote and you've been assigned to a new work order.</p>
        ${infoCard(`
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle}</p>
          ${infoRow('Work Order #', workOrderNumber)}
          ${infoRow('Client', clientName)}
          ${locationName ? infoRow('Location', locationName) : ''}
          ${locationAddress ? infoRow('Address', locationAddress) : ''}
        `)}
        ${alertBox('<strong>Next Steps:</strong><br>1. Log in to your Subcontractor Portal<br>2. Review the work order details<br>3. Accept the assignment and schedule your service date', 'info')}
        ${ctaButton('View Work Order', APP_URL + '/subcontractor-portal/assigned')}
      `,
    });

    await sendEmail({
      to: toEmail,
      subject: `Work Order Assignment: ${workOrderNumber} - ${workOrderTitle}`,
      html: emailHtml,
    });
    await logEmail({ type: 'assignment', to: toEmail, subject: `Work Order Assignment: ${workOrderNumber} - ${workOrderTitle}`, status: 'sent', context: { toName, workOrderNumber, workOrderTitle, clientName, locationName, locationAddress } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending assignment email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    await logEmail({ type: 'assignment', to: body?.toEmail || '', subject: `Work Order Assignment`, status: 'failed', context: { toName: body?.toName, workOrderNumber: body?.workOrderNumber }, error: errorMessage });
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');

    return NextResponse.json(
      {
        error: 'Failed to send assignment email',
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
