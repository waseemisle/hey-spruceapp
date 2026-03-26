import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const {
      workOrderId,
      workOrderNumber,
      title,
      clientName,
      clientEmail,
      locationName,
      priority,
      description,
    } = await request.json();

    if (!clientEmail || !workOrderNumber || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const portalLink = `${APP_URL}/client-portal/work-orders${workOrderId ? `/${workOrderId}` : ''}`;

    const priorityLabel = priority
      ? priority.charAt(0).toUpperCase() + priority.slice(1)
      : 'Medium';

    const emailHtml = emailLayout({
      title: 'Work Order Received',
      preheader: `We've received your request — ${workOrderNumber}: ${title}`,
      body: `
        <p style="margin:0 0 20px 0;">Hello <strong>${clientName || 'there'}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">
          Thank you for submitting your work order. We have received your request and our team will review it shortly. You will be notified once it has been approved and assigned.
        </p>
        ${infoCard(`
          <div style="margin-bottom:12px;">
            ${priorityBadge(priority || 'medium')}
          </div>
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${title}</p>
          ${infoRow('Work Order #', workOrderNumber)}
          ${locationName ? infoRow('Location', locationName) : ''}
          ${infoRow('Priority', priorityLabel)}
          ${infoRow('Status', 'Pending Review')}
          ${description ? `<p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#5A6C7A;">${description}</p>` : ''}
        `)}
        ${alertBox('Our team typically reviews new work orders within 1–2 business days. You will receive an update by email as your request progresses.', 'info')}
        ${ctaButton('View Your Work Order', portalLink)}
        <p style="margin:24px 0 0 0;font-size:12px;color:#8A9CAB;">
          If you have any questions, please contact us at <a href="mailto:info@groundops.co" style="color:#8A9CAB;">info@groundops.co</a>.
        </p>
      `,
    });

    const subject = `Work Order Received: ${workOrderNumber} — ${title}`;

    try {
      await sendEmail({ to: clientEmail, subject, html: emailHtml });
      await logEmail({
        type: 'work-order-received',
        to: clientEmail,
        subject,
        status: 'sent',
        context: { workOrderId, workOrderNumber, title, clientName, clientEmail, locationName, priority },
      });
    } catch (err: any) {
      await logEmail({
        type: 'work-order-received',
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
    console.error('Error sending work order received email:', error);
    return NextResponse.json(
      { error: 'Failed to send work order received email', details: error.message },
      { status: 500 }
    );
  }
}
