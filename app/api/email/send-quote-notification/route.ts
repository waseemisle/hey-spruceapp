import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';
import { getServerDb } from '@/lib/firebase-server';
import { collection, getDocs } from 'firebase/firestore';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let {
      toEmail,
      toName,
      workOrderNumber,
      workOrderTitle,
      subcontractorName,
      quoteAmount,
      proposedServiceDate,
      proposedServiceTime,
      portalLink,
      notifyAdmins,
      category,
      locationName,
      priority,
      description,
    } = body;

    // If notifyAdmins is true, fetch admin emails server-side and send to each
    if (notifyAdmins) {
      if (!workOrderNumber || !subcontractorName) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      try {
        const db = await getServerDb();
        const adminsSnap = await getDocs(collection(db, 'adminUsers'));
        const adminEmails: { email: string; name: string }[] = [];
        adminsSnap.docs.forEach(d => {
          const data = d.data();
          if (data.email && data.workOrderEmailNotifications === true) {
            adminEmails.push({ email: data.email, name: data.fullName || 'Admin' });
          }
        });

        let sent = 0;
        for (const admin of adminEmails) {
          try {
            const emailHtml = emailLayout({
              title: 'New Quote Received',
              preheader: `${subcontractorName} submitted a quote for review`,
              body: `
                <p style="margin:0 0 20px 0;">Hello <strong>${admin.name}</strong>,</p>
                <p style="margin:0 0 20px 0;color:#5A6C7A;">A new work order quote is available for review.</p>
                ${infoCard(`
                  <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle || workOrderNumber}</p>
                  ${infoRow('Work Order #', workOrderNumber)}
                  ${subcontractorName ? infoRow('Submitted by', subcontractorName) : ''}
                  ${quoteAmount ? infoRow('Quote Amount', '$' + Number(quoteAmount).toLocaleString()) : ''}
                  ${category ? infoRow('Category', category) : ''}
                  ${locationName ? infoRow('Location', locationName) : ''}
                  ${priority ? infoRow('Priority', priority.charAt(0).toUpperCase() + priority.slice(1)) : ''}
                  ${description ? '<p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#5A6C7A;">' + description + '</p>' : ''}
                `)}
                ${alertBox('<strong>Please review the quote and share with the client.</strong>', 'info')}
                ${ctaButton('Review Quote', APP_URL + '/admin-portal/work-orders')}
              `,
            });
            await sendEmail({ to: admin.email, subject: `New Quote Received: ${workOrderTitle || workOrderNumber}`, html: emailHtml });
            await logEmail({ type: 'quote-notification', to: admin.email, subject: `New Quote Received: ${workOrderTitle || workOrderNumber}`, status: 'sent', context: { toName: admin.name, workOrderNumber, workOrderTitle, subcontractorName, quoteAmount } });
            sent++;
          } catch (e: any) {
            await logEmail({ type: 'quote-notification', to: admin.email, subject: '', status: 'failed', context: {}, error: e.message }).catch(() => {});
          }
        }
        return NextResponse.json({ success: true, adminsSent: sent });
      } catch (e: any) {
        console.error('Error notifying admins:', e);
        return NextResponse.json({ success: true, adminsSent: 0, error: e.message });
      }
    }

    // Standard single-recipient flow
    if (!toEmail || !workOrderNumber || !subcontractorName || !quoteAmount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
