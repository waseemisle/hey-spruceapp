import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, alertBox } from '@/lib/email-template';

export async function POST(request: NextRequest) {
  try {
    const {
      toEmail,
      toName,
      workOrderNumber,
      workOrderTitle,
      completedBy,
      locationName,
    } = await request.json();

    if (!toEmail || !workOrderNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const emailHtml = emailLayout({
      title: 'Work Order Completed',
      preheader: `Your work order ${workOrderNumber} has been completed`,
      body: `
        <p style="margin:0 0 20px 0;">Hi <strong>${toName || 'there'}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">
          Great news! Your work order has been marked as <strong>completed</strong> by the service provider.
        </p>
        ${infoCard(`
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle || workOrderNumber}</p>
          ${infoRow('Work Order #', workOrderNumber)}
          ${locationName ? infoRow('Location', locationName) : ''}
          ${completedBy ? infoRow('Completed by', completedBy) : ''}
        `)}
        ${alertBox(
          'An invoice will be generated and sent to you shortly. If you have any questions, please contact us.',
          'info'
        )}
        <p style="margin:24px 0 0 0;font-size:13px;color:#8A9CAB;text-align:center;">
          Thank you for choosing GroundOps for your facility maintenance needs.
        </p>
      `,
    });

    await sendEmail({
      to: toEmail,
      subject: `Work Order Completed: ${workOrderNumber}`,
      html: emailHtml,
    });

    await logEmail({
      type: 'work-order-completion-client',
      to: toEmail,
      subject: `Work Order Completed: ${workOrderNumber}`,
      status: 'sent',
      context: { toName, workOrderNumber, workOrderTitle, completedBy, locationName },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending work order completion email to client:', error);
    return NextResponse.json(
      { error: 'Failed to send completion email', details: error.message },
      { status: 500 }
    );
  }
}
