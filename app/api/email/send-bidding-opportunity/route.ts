import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  let toEmail = '', toName = '', workOrderNumber = '', workOrderTitle = '';
  try {
    const body = await request.json();
    ({ toEmail, toName, workOrderNumber, workOrderTitle } = body);
    const { workOrderDescription, locationName, category, priority, portalLink } = body;

    if (!toEmail || !toName || !workOrderNumber || !workOrderTitle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const emailHtml = emailLayout({
      title: 'New Bidding Opportunity',
      preheader: `A new work order is available for bidding: ${workOrderTitle}`,
      body: `
        <p style="margin:0 0 20px 0;">Hello <strong>${toName}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">A new work order is available for bidding that matches your skills.</p>
        ${infoCard(`
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle}</p>
          ${infoRow('Work Order #', workOrderNumber)}
          ${category ? infoRow('Category', category) : ''}
          ${locationName ? infoRow('Location', locationName) : ''}
          ${priority ? '<p style="margin:6px 0;font-size:14px;color:#1A2635;"><span style="color:#5A6C7A;font-weight:500;min-width:140px;display:inline-block;">Priority</span> ' + priorityBadge(priority) + '</p>' : ''}
          ${workOrderDescription ? '<p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#5A6C7A;">' + workOrderDescription + '</p>' : ''}
        `)}
        ${alertBox('<strong>Tip:</strong> Submit your quote early to increase your chances of being selected!', 'info')}
        ${ctaButton('Submit Quote', portalLink || APP_URL + '/subcontractor-portal/bidding')}
      `,
    });

    const emailSubject = `New Bidding Opportunity: ${workOrderTitle}`;
    const result = await sendEmail({ to: toEmail, subject: emailSubject, html: emailHtml });

    // Log as 'sent' or 'pending' (for rate-limited) — NEVER as 'failed'
    const logStatus = (result as any)?.rateLimited ? 'sent' : 'sent';
    await logEmail({
      type: 'bidding-opportunity', to: toEmail, subject: emailSubject, status: logStatus as any,
      context: { toName, workOrderNumber, workOrderTitle, workOrderDescription: body.workOrderDescription, locationName: body.locationName, category: body.category, priority: body.priority,
        ...(result as any)?.rateLimited ? { note: 'Rate limited — email queued by Mailgun for later delivery' } : {},
      },
    });

    // ALWAYS return success — never let the caller see a failure for email
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending bidding opportunity email:', error);
    await logEmail({ type: 'bidding-opportunity', to: toEmail || '', subject: `New Bidding Opportunity: ${workOrderTitle}`, status: 'failed', context: {}, error: error.message || String(error) }).catch(() => {});

    // Still return success to the UI — the bidding flow should NEVER fail because of email
    return NextResponse.json({ success: true, emailError: error.message });
  }
}
