import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, priorityBadge } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const {
      toEmail,
      toName,
      maintRequestId,
      venue,
      requestor,
      title,
      description,
      priority,
      date,
      portalLink
    } = await request.json();


    // Validate required fields
    if (!toEmail || !venue || !title) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Format date if provided
    let formattedDate = 'Not specified';
    if (date) {
      try {
        // Handle different date formats
        let dateObj: Date;
        if (date instanceof Date) {
          dateObj = date;
        } else if (typeof date === 'string') {
          dateObj = new Date(date);
        } else if (date && typeof date === 'object' && 'seconds' in date) {
          // Handle Firestore Timestamp format
          dateObj = new Date(date.seconds * 1000);
        } else if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
          // Handle Firestore Timestamp with toDate method
          dateObj = date.toDate();
        } else {
          dateObj = new Date(date);
        }

        // Check if date is valid
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          });
        } else {
          formattedDate = 'Invalid Date';
        }
      } catch (error) {
        console.error('Error formatting date:', error, 'Date value:', date);
        formattedDate = 'Invalid Date';
      }
    }

    // Create email HTML
    const emailHtml = emailLayout({
      title: 'New Maintenance Request',
      preheader: `New maintenance request: ${title}`,
      body: `
        <p style="margin:0 0 20px 0;">Hello${toName ? ' <strong>' + toName + '</strong>' : ''},</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">A new maintenance request has been submitted and requires your attention.</p>
        ${infoCard(`
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${title}</p>
          ${infoRow('Venue', venue)}
          ${requestor ? infoRow('Requested by', requestor) : ''}
          ${formattedDate !== 'Not specified' ? infoRow('Date', formattedDate) : ''}
          ${priority ? '<p style="margin:6px 0;font-size:14px;color:#1A2635;"><span style="color:#5A6C7A;font-weight:500;min-width:140px;display:inline-block;">Priority</span> ' + priorityBadge(priority) + '</p>' : ''}
          ${description ? '<p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#5A6C7A;">' + description + '</p>' : ''}
        `)}
        ${ctaButton('View Request', portalLink || APP_URL + '/admin-portal/work-orders')}
      `,
    });

    // Send email via Mailgun
    const subject = `${priority === 'high' || priority === 'urgent' ? '🚨 URGENT: ' : ''}New Maintenance Request: ${title}`;
    await sendEmail({
      to: toEmail,
      subject,
      html: emailHtml,
    });
    await logEmail({ type: 'maint-request-notification', to: toEmail, subject, status: 'sent', context: { toName, maintRequestId, venue, requestor, title, priority } });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('❌ Error sending maint request notification email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');

    return NextResponse.json(
      {
        error: 'Failed to send maintenance request notification email',
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
