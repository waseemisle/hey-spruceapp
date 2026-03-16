import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const {
      toEmail,
      toName,
      workOrderNumber,
      workOrderTitle,
      workOrderDescription,
      locationName,
      category,
      priority,
      portalLink
    } = await request.json();

    // Validate required fields
    if (!toEmail || !toName || !workOrderNumber || !workOrderTitle) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create email HTML
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

    // Send email via Mailgun
    await sendEmail({
      to: toEmail,
      subject: `New Bidding Opportunity: ${workOrderTitle}`,
      html: emailHtml,
    });
    await logEmail({ type: 'bidding-opportunity', to: toEmail, subject: `New Bidding Opportunity: ${workOrderTitle}`, status: 'sent', context: { toName, workOrderNumber, workOrderTitle, workOrderDescription, locationName, category, priority } });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('❌ Error sending bidding opportunity email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');

    return NextResponse.json(
      {
        error: 'Failed to send bidding opportunity email',
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
