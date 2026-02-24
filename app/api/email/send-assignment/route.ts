import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { toEmail, toName, workOrderNumber, workOrderTitle, clientName, locationName, locationAddress } = body;

    const LOGO_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/logo.png`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Work Order Assignment - ${workOrderNumber}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #162040; padding: 16px 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <img src="${LOGO_URL}" alt="GroundOps" style="max-height: 60px; width: auto;" />
        </div>
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">GroundOps — Facility Maintenance Infrastructure</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Facility Maintenance Infrastructure</p>
        </div>

        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #10b981; margin-top: 0;">Work Order Assigned to You</h2>

          <p>Hi ${toName},</p>

          <p>Great news! You have been assigned to a new work order. The client has approved your quote and is ready for you to begin work.</p>

          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="margin-top: 0; color: #10b981;">Work Order Details</h3>
            <p><strong>Work Order Number:</strong> ${workOrderNumber}</p>
            <p><strong>Title:</strong> ${workOrderTitle}</p>
            <p><strong>Client:</strong> ${clientName}</p>
            ${locationName ? `<p><strong>Location:</strong> ${locationName}</p>` : ''}
            ${locationAddress ? `<p><strong>Address:</strong> ${locationAddress}</p>` : ''}
          </div>

          <div style="background: #dcfce7; padding: 15px; border-left: 4px solid #10b981; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px;">
              <strong>Next Steps:</strong><br>
              1. Log in to your subcontractor portal<br>
              2. Review the work order details<br>
              3. Accept the assignment and schedule your service date
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/subcontractor-portal/assigned"
               style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Work Order
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

          <p style="font-size: 12px; color: #6b7280; text-align: center;">
            GroundOps — Facility Maintenance<br>
            Los Angeles, CA<br>
            Phone: <a href="tel:3235551234" style="color: #10b981; text-decoration: none;">(323) 555-1234</a> | 
            Email: <a href="mailto:info@groundops.com" style="color: #10b981; text-decoration: none;">info@groundops.com</a> | 
            Website: <a href="https://www.groundops.co/" style="color: #10b981; text-decoration: none;">groundops.co</a>
          </p>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: toEmail,
      subject: `Work Order Assignment: ${workOrderNumber} - ${workOrderTitle}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending assignment email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('MAILGUN');
    
    return NextResponse.json(
      {
        error: 'Failed to send assignment email',
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
