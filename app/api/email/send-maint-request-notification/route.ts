import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';

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

    const priorityColor = priority === 'high' || priority === 'urgent'
      ? '#ef4444'
      : priority === 'medium' || priority === 'normal'
      ? '#f59e0b'
      : '#10b981';

    const priorityLabel = priority
      ? priority.charAt(0).toUpperCase() + priority.slice(1)
      : 'Normal';

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
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Maintenance Request</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, ${priorityColor} 0%, ${priorityColor}dd 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">New Maintenance Request</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Priority: ${priorityLabel}</p>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${toName || 'Admin'},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              A new maintenance request has been received via the API and requires your attention.
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${priorityColor};">
              <h2 style="margin: 0 0 15px 0; font-size: 20px; color: ${priorityColor};">${title}</h2>

              <div style="margin: 15px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Venue:</strong> ${venue}</p>
                ${requestor ? `<p style="margin: 0 0 10px 0;"><strong>Requestor:</strong> ${requestor}</p>` : ''}
                <p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: ${priorityColor}; font-weight: bold;">${priorityLabel}</span></p>
                <p style="margin: 0 0 10px 0;"><strong>Date/Time:</strong> ${formattedDate}</p>
              </div>

              ${description ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 5px 0;"><strong>Description:</strong></p>
                  <p style="margin: 0; color: #4b5563;">${description}</p>
                </div>
              ` : ''}
            </div>

            ${priority === 'high' || priority === 'urgent' ? `
              <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
                <p style="margin: 0; font-size: 14px; color: #991b1b;">
                  <strong>⚠️ URGENT:</strong> This request requires immediate attention!
                </p>
              </div>
            ` : ''}

            <p style="font-size: 16px; margin: 20px 0;">
              A work order has been automatically created for this maintenance request. Please review and approve it in the Admin Portal:
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${portalLink || `${process.env.NEXT_PUBLIC_APP_URL}/admin-portal/work-orders`}"
                 style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        display: inline-block;">
                Review Work Order
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <strong>Note:</strong> This request was automatically received via the maintenance request API.
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
      subject: `${priority === 'high' || priority === 'urgent' ? '🚨 URGENT: ' : ''}New Maintenance Request: ${title}`,
      html: emailHtml,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('❌ Error sending maint request notification email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('MAILGUN');
    
    return NextResponse.json(
      {
        error: 'Failed to send maintenance request notification email',
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
