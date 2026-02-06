import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';

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
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Quote Received</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">New Quote Received</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${toName || 'there'},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              A new quote has been submitted for <strong>Work Order ${workOrderNumber}</strong>.
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              ${workOrderTitle ? `<p style="margin: 0 0 10px 0;"><strong>Work Order:</strong> ${workOrderTitle}</p>` : ''}
              <p style="margin: 0 0 10px 0;"><strong>Submitted by:</strong> ${subcontractorName}</p>
              <p style="margin: 0 0 10px 0;"><strong>Quote Amount:</strong> $${parseFloat(quoteAmount).toLocaleString()}</p>
              ${formattedDate ? `<p style="margin: 0 0 10px 0;"><strong>Proposed Service Date:</strong> ${formattedDate}</p>` : ''}
              ${proposedServiceTime ? `<p style="margin: 0;"><strong>Proposed Service Time:</strong> ${proposedServiceTime}</p>` : ''}
            </div>

            <p style="font-size: 16px; margin-bottom: 30px;">
              View the full quote details in your portal:
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${portalLink || process.env.NEXT_PUBLIC_APP_URL}"
                 style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        display: inline-block;">
                View Quote
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              If you have any questions, please contact our support team.
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
            <p>© ${new Date().getFullYear()} Hey Spruce. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    // Send email via Mailgun
    await sendEmail({
      to: toEmail,
      subject: `New Quote Received for Work Order ${workOrderNumber}`,
      html: emailHtml,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('❌ Error sending quote notification email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('MAILGUN');
    
    return NextResponse.json(
      {
        error: 'Failed to send quote notification email',
        details: errorMessage,
        configError: isConfigError,
        suggestion: isConfigError
          ? 'Please configure MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL environment variables.'
          : undefined
      },
      { status: 500 }
    );
  }
}
