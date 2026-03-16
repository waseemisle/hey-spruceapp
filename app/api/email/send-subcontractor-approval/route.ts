import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, ctaButton, alertBox } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const {
      toEmail,
      toName,
      businessName,
      approvedBy,
      portalLink
    } = await request.json();

    // Validate required fields
    if (!toEmail || !toName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create email HTML
    const emailHtml = emailLayout({
      title: 'Subcontractor Account Approved',
      preheader: 'Your GroundOps subcontractor account is ready to use',
      body: `
        <p style="margin:0 0 20px 0;">Hello <strong>${toName}${businessName ? ' (' + businessName + ')' : ''}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">Your GroundOps subcontractor account has been approved${approvedBy ? ' by <strong>' + approvedBy + '</strong>' : ''}.</p>
        ${alertBox('<strong>Access Granted:</strong> You can now log in and start bidding on work orders.', 'success')}
        <ul style="margin:0 0 24px 0;padding-left:20px;color:#1A2635;font-size:14px;line-height:2;">
          <li>View and bid on available work orders</li>
          <li>Manage your assigned jobs</li>
          <li>Submit quotes and invoices</li>
        </ul>
        ${ctaButton('Login to Subcontractor Portal', portalLink || APP_URL + '/subcontractor-portal')}
        ${alertBox('<strong>Need Help?</strong> Contact us at <a href="mailto:info@groundops.co" style="color:#2563EB;">info@groundops.co</a>', 'info')}
      `,
    });

    // Send email via Mailgun
    await sendEmail({
      to: toEmail,
      subject: 'Your GroundOps Subcontractor Account Has Been Approved!',
      html: emailHtml,
    });
    await logEmail({ type: 'subcontractor-approval', to: toEmail, subject: 'Your GroundOps Subcontractor Account Has Been Approved!', status: 'sent', context: { toName, businessName, approvedBy } });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('❌ Error sending subcontractor approval email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');

    return NextResponse.json(
      {
        error: 'Failed to send subcontractor approval email',
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
