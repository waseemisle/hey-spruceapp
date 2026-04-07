import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const {
      toEmail,
      toName,
      workOrderNumber,
      workOrderTitle,
      subcontractorName,
      quoteAmount,
      proposedServiceDate,
      proposedServiceTime,
      portalLink
    } = await request.json();

    // Validate required fields
    if (!toEmail || !workOrderNumber || !subcontractorName || !quoteAmount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Format date if provided
    const formattedDate = proposedServiceDate
      ? new Date(proposedServiceDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : null;

    // Create email HTML
    const emailHtml = emailLayout({
      title: 'New Quote Received',
      preheader: `${subcontractorName} submitted a quote of $${quoteAmount} for ${workOrderTitle}`,
      body: `
        <p style="margin:0 0 20px 0;">Hello ${toName || 'there'},</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">A new quote has been submitted for <strong>Work Order ${workOrderNumber}</strong>.</p>
        ${infoCard(`
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle}</p>
          ${infoRow('Work Order #', workOrderNumber)}
          ${infoRow('Submitted by', subcontractorName)}
          ${infoRow('Quote Amount', '$' + quoteAmount)}
          ${formattedDate ? infoRow('Proposed Date', formattedDate + (proposedServiceTime ? ' at ' + proposedServiceTime : '')) : ''}
        `)}
        ${alertBox('Log in to the admin portal to review and approve or reject this quote.', 'info')}
        ${ctaButton('Review Quote', portalLink || APP_URL + '/admin-portal/work-orders')}
      `,
    });

    // Send email via Mailgun
    await sendEmail({
      to: toEmail,
      subject: `New Quote Received for Work Order ${workOrderNumber}`,
      html: emailHtml,
    });
    await logEmail({ type: 'quote-notification', to: toEmail, subject: `New Quote Received for Work Order ${workOrderNumber}`, status: 'sent', context: { toName, workOrderNumber, workOrderTitle, subcontractorName, quoteAmount, proposedServiceDate, proposedServiceTime } });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('❌ Error sending quote notification email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');
    await logEmail({ type: 'quote-notification', to: '', subject: '', status: 'failed', context: {}, error: error.message || String(error) }).catch(() => {});

    return NextResponse.json(
      {
        error: 'Failed to send quote notification email',
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
