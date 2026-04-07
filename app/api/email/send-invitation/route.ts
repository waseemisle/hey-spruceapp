import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, ctaButton, alertBox } from '@/lib/email-template';

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, role, resetLink } = await request.json();

    // Validate required fields
    if (!email || !fullName || !role || !resetLink) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Determine role-specific content
    const roleTitle = role === 'subcontractor' ? 'Subcontractor' :
                     role === 'client' ? 'Client' : 'Admin User';

    const portalName = role === 'subcontractor' ? 'Subcontractor Portal' :
                      role === 'client' ? 'Client Portal' : 'Admin Portal';

    // Create email HTML
    const emailHtml = emailLayout({
      title: 'Welcome to GroundOps',
      preheader: `You've been invited to join GroundOps as a ${roleTitle}`,
      body: `
        <p style="margin:0 0 20px 0;">Hello <strong>${fullName}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">You've been invited to join <strong>GroundOps</strong> as a <strong>${roleTitle}</strong>. Set up your password to get started.</p>
        ${alertBox('You\'ll have access to the <strong>' + portalName + '</strong> once your account is activated.', 'info')}
        ${ctaButton('Set Up Your Password', resetLink)}
        <p style="margin:24px 0 0 0;font-size:13px;color:#8A9CAB;text-align:center;">This invitation link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>
      `,
    });

    // Send email via Mailgun
    await sendEmail({
      to: email,
      subject: `Welcome to GroundOps - Set Up Your ${roleTitle} Account`,
      html: emailHtml,
    });
    await logEmail({ type: 'invitation', to: email, subject: `Welcome to GroundOps - Set Up Your ${roleTitle} Account`, status: 'sent', context: { fullName, role, roleTitle } });

    return NextResponse.json({
      success: true,
      message: 'Invitation email sent successfully'
    });

  } catch (error: any) {
    console.error('❌ Error sending invitation email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');
    await logEmail({ type: 'invitation', to: '', subject: '', status: 'failed', context: {}, error: error.message || String(error) }).catch(() => {});

    return NextResponse.json(
      {
        error: 'Failed to send invitation email',
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
