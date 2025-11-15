import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

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

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'matthew@heyspruce.com';

    // If no Resend API key, log to console (test mode)
    if (!RESEND_API_KEY) {
      console.log('\n========================================');
      console.log('📧 BIDDING OPPORTUNITY EMAIL (TEST MODE)');
      console.log('========================================');
      console.log('To:', toEmail);
      console.log('Subcontractor:', toName);
      console.log('Work Order:', workOrderNumber);
      console.log('Title:', workOrderTitle);
      if (locationName) console.log('Location:', locationName);
      if (category) console.log('Category:', category);
      console.log('\n⚠️  Resend not configured - Add RESEND_API_KEY to environment variables');
      console.log('========================================\n');
      return NextResponse.json({
        success: true,
        message: 'Test mode: Email logged to console'
      });
    }

    const priorityColor = priority === 'high' ? '#ef4444' : priority === 'medium' ? '#f59e0b' : '#10b981';
    const priorityLabel = priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Normal';

    // Create email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Bidding Opportunity</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">New Bidding Opportunity</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello ${toName},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              A new work order is available for bidding that matches your skills.
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #10b981;">${workOrderTitle}</h2>
              <p style="margin: 0 0 10px 0;"><strong>Work Order Number:</strong> ${workOrderNumber}</p>
              ${category ? `<p style="margin: 0 0 10px 0;"><strong>Category:</strong> ${category}</p>` : ''}
              ${locationName ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${locationName}</p>` : ''}
              ${priority ? `<p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: ${priorityColor}; font-weight: bold;">${priorityLabel}</span></p>` : ''}
              ${workOrderDescription ? `<p style="margin: 15px 0 0 0; padding-top: 15px; border-top: 1px solid #e5e7eb;"><strong>Description:</strong><br/>${workOrderDescription}</p>` : ''}
            </div>

            <p style="font-size: 16px; margin-bottom: 30px;">
              Review the work order details and submit your quote in the Subcontractor Portal:
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${portalLink || `${process.env.NEXT_PUBLIC_APP_URL}/subcontractor-portal/bidding`}"
                 style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        display: inline-block;">
                Submit Quote
              </a>
            </div>

            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #3b82f6;">
              <p style="margin: 0; font-size: 14px; color: #1e40af;">
                <strong>💡 Tip:</strong> Submit your quote early to increase your chances of being selected!
              </p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
            <p>© ${new Date().getFullYear()} Hey Spruce. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    // Send email via Resend
    const resend = new Resend(RESEND_API_KEY);

    const data = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: toEmail,
      subject: `New Bidding Opportunity: ${workOrderTitle}`,
      html: emailHtml,
    });

    return NextResponse.json({
      success: true,
      messageId: (data as any).id,
    });
  } catch (error: any) {
    console.error('Error sending bidding opportunity email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
