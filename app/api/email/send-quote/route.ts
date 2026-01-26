import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/sendgrid';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { toEmail, toName, quoteNumber, workOrderTitle, totalAmount, clientAmount, markupPercentage, lineItems, notes } = body;

    // Build line items HTML
    let lineItemsHtml = '';
    if (lineItems && lineItems.length > 0) {
      lineItemsHtml = lineItems.map((item: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${item.amount.toFixed(2)}</td>
        </tr>
      `).join('');
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quote #${quoteNumber}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Hey Spruce Restaurant Cleaning & Maintenance</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Restaurant Cleaning & Maintenance</p>
        </div>

        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #667eea; margin-top: 0;">New Quote Available</h2>

          <p>Hi ${toName},</p>

          <p>We have prepared a quote for your service request: <strong>${workOrderTitle}</strong></p>

          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="margin-top: 0; color: #667eea;">Quote Details</h3>
            <p><strong>Quote Number:</strong> ${quoteNumber}</p>
            <p><strong>Work Order:</strong> ${workOrderTitle}</p>

            ${lineItems && lineItems.length > 0 ? `
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                  <tr style="background: #667eea; color: white;">
                    <th style="padding: 10px; text-align: left;">Description</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: right;">Unit Price</th>
                    <th style="padding: 10px; text-align: right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemsHtml}
                </tbody>
              </table>
            ` : ''}

            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #667eea;">
              <p style="font-size: 24px; font-weight: bold; color: #667eea; margin: 0;">
                Total: $${(clientAmount || totalAmount).toLocaleString()}
              </p>
            </div>

            ${notes ? `
              <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px;"><strong>Note:</strong> ${notes}</p>
              </div>
            ` : ''}
          </div>

          <p>Please review the quote and let us know if you have any questions or would like to proceed.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/client-portal/quotes"
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Quote in Portal
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

          <p style="font-size: 12px; color: #6b7280; text-align: center;">
            Hey Spruce Restaurant Cleaning & Maintenance<br>
            1972 E 20th St, Los Angeles, CA 90058<br>
            Phone: <a href="tel:1-877-253-26464" style="color: #667eea; text-decoration: none;">1-877-253-26464</a> | 
            Email: <a href="mailto:info@heyspruce.com" style="color: #667eea; text-decoration: none;">info@heyspruce.com</a> | 
            Website: <a href="https://www.heyspruce.com/" style="color: #667eea; text-decoration: none;">www.heyspruce.com</a>
          </p>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: toEmail,
      subject: `Quote #${quoteNumber} - ${workOrderTitle}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending quote email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('SENDGRID');
    
    return NextResponse.json(
      {
        error: 'Failed to send quote email',
        details: errorMessage,
        configError: isConfigError,
        suggestion: isConfigError ? 'Please configure SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables. See SENDGRID_SETUP.md for instructions.' : undefined
      },
      { status: 500 }
    );
  }
}
