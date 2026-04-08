import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  let clientEmail = '';
  let workOrderNumber = '';
  let title = '';
  try {
    const body = await request.json();
    ({
      clientEmail,
      workOrderNumber,
      title,
    } = body);
    const { workOrderId, clientName, locationName, priority } = body;

    if (!clientEmail || !workOrderNumber || !title) {
      await logEmail({
        type: 'work-order-approved',
        to: clientEmail || '(no client email)',
        subject: `Work Order Approved: ${workOrderNumber || '?'} — ${title || '?'}`,
        status: 'skipped',
        context: { workOrderId, workOrderNumber, title, clientName, reason: !clientEmail ? 'Client has no email address' : 'Missing required fields' },
      }).catch(() => {});
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const portalLink = `${APP_URL}/client-portal/work-orders${workOrderId ? `/${workOrderId}` : ''}`;

    const emailHtml = emailLayout({
      title: 'Work Order Approved',
      preheader: `Your work order ${workOrderNumber} has been approved`,
      body: `
        <p style="margin:0 0 20px 0;">Hello <strong>${clientName || 'there'}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">
          Great news! Your work order has been reviewed and approved. Our team will begin coordinating the next steps, including assigning a service provider.
        </p>
        ${infoCard(`
          <div style="margin-bottom:12px;">
            ${priorityBadge(priority || 'medium')}
          </div>
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${title}</p>
          ${infoRow('Work Order #', workOrderNumber)}
          ${locationName ? infoRow('Location', locationName) : ''}
          ${infoRow('Status', '<span style="color:#16A34A;font-weight:600;">Approved</span>')}
        `)}
        ${alertBox('A service provider will be assigned shortly. You will receive another notification once work is scheduled.', 'info')}
        ${ctaButton('View Work Order', portalLink)}
        <p style="margin:24px 0 0 0;font-size:12px;color:#8A9CAB;">
          If you have any questions, please contact us at <a href="mailto:info@groundops.co" style="color:#8A9CAB;">info@groundops.co</a>.
        </p>
      `,
    });

    const subject = `Work Order Approved: ${workOrderNumber} — ${title}`;

    try {
      await sendEmail({ to: clientEmail, subject, html: emailHtml });
      await logEmail({
        type: 'work-order-approved',
        to: clientEmail,
        subject,
        status: 'sent',
        context: { workOrderId, workOrderNumber, title, clientName, clientEmail, locationName, priority },
      });
    } catch (err: any) {
      await logEmail({
        type: 'work-order-approved',
        to: clientEmail,
        subject,
        status: 'failed',
        context: { workOrderId, workOrderNumber, title, clientName, clientEmail, locationName, priority },
        error: err.message,
      });
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending work order approved email:', error);
    return NextResponse.json({ success: true, emailError: error.message });
  }
}
