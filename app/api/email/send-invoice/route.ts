import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      toEmail,
      toName,
      invoiceNumber,
      workOrderTitle,
      totalAmount,
      dueDate,
      lineItems,
      notes,
      stripePaymentLink,
      pdfBase64,
      workOrderPdfBase64
    } = body;

    const sendGridApiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'waseem@shurehw.com';

    // Check if we're in development/testing mode without proper SendGrid setup
    const isTestMode = !sendGridApiKey || sendGridApiKey.includes('YOUR_') || sendGridApiKey.length < 20;

    if (isTestMode) {
      console.log('📧 EMAIL (TEST MODE) - Would send to:', toEmail);
      console.log('   Subject: Invoice #' + invoiceNumber);
      console.log('   Amount: $' + totalAmount);
      console.log('   Due Date:', dueDate);
      if (stripePaymentLink) {
        console.log('   Payment Link:', stripePaymentLink);
      }

      return NextResponse.json({
        success: true,
        testMode: true,
        message: 'Email not sent (test mode) - Configure SendGrid for production'
      });
    }

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
        <title>Invoice #${invoiceNumber}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">HEY SPRUCE APP</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Property Maintenance Management</p>
        </div>

        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #667eea; margin-top: 0;">Invoice Ready for Payment</h2>

          <p>Hi ${toName},</p>

          <p>Your invoice and work order for <strong>${workOrderTitle}</strong> are ready. Please find both documents attached to this email.</p>

          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="margin-top: 0; color: #667eea;">Invoice Details</h3>
            <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
            <p><strong>Work Order:</strong> ${workOrderTitle}</p>
            <p><strong>Due Date:</strong> ${dueDate}</p>

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
                Amount Due: $${totalAmount.toLocaleString()}
              </p>
            </div>

            ${notes ? `
              <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px;"><strong>Note:</strong> ${notes}</p>
              </div>
            ` : ''}
          </div>

          ${stripePaymentLink ? `
            <div style="background: #10b981; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="color: white; margin-top: 0;">Pay Online with Stripe</h3>
              <p style="color: white; margin-bottom: 20px;">Click the button below to pay securely with your credit or debit card.</p>
              <a href="${stripePaymentLink}"
                 style="background: white; color: #10b981; padding: 14px 40px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">
                Pay Now - $${totalAmount.toLocaleString()}
              </a>
            </div>
          ` : ''}

          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #374151;">Alternative Payment Methods:</h4>
            <p style="margin: 5px 0; font-size: 14px;">Send check to:<br>
            <strong>Hey Spruce App</strong><br>
            P.O. Box 104477<br>
            Pasadena, CA 91189-4477</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/client-portal/invoices"
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Invoice in Portal
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

          <p style="font-size: 12px; color: #6b7280; text-align: center;">
            Hey Spruce App | San Francisco, CA 94104<br>
            Phone: 877-253-2646 | Email: waseem@shurehw.com
          </p>
        </div>
      </body>
      </html>
    `;

    const emailPayload: any = {
      personalizations: [
        {
          to: [{ email: toEmail, name: toName }],
          subject: `Invoice #${invoiceNumber} - Payment Due`,
        },
      ],
      from: {
        email: fromEmail,
        name: 'Hey Spruce App',
      },
      content: [
        {
          type: 'text/html',
          value: emailHtml,
        },
      ],
    };

    // Add PDF attachments if provided
    const attachments = [];
    
    if (pdfBase64) {
      attachments.push({
        content: pdfBase64,
        filename: `Invoice_${invoiceNumber}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      });
    }
    
    if (workOrderPdfBase64) {
      attachments.push({
        content: workOrderPdfBase64,
        filename: `WorkOrder_${workOrderTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      });
    }
    
    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendGridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ SendGrid error response:', {
        status: response.status,
        statusText: response.statusText,
        body: error,
        apiKey: sendGridApiKey ? `${sendGridApiKey.substring(0, 10)}...` : 'not set',
        fromEmail: fromEmail
      });

      // Parse SendGrid error for more details
      let errorMessage = 'Failed to send email';
      let troubleshooting = '';

      try {
        const errorData = JSON.parse(error);
        if (errorData.errors && errorData.errors.length > 0) {
          errorMessage = errorData.errors[0].message || errorMessage;

          // Provide specific troubleshooting based on error
          if (response.status === 403) {
            troubleshooting = 'SendGrid 403 Error - This usually means:\n' +
              `1. Your sender email (${fromEmail}) is not verified in SendGrid\n` +
              '2. Your API key does not have "Mail Send" permissions\n' +
              '3. Your SendGrid account has restrictions\n\n' +
              'To fix: Log into SendGrid → Settings → Sender Authentication → Verify a sender email';
          }
        }
      } catch (e) {
        errorMessage = error || errorMessage;
      }

      console.error('📋 Troubleshooting:', troubleshooting || 'Check SendGrid configuration');

      // Log the email that failed to send
      console.log('📧 Failed email details:', {
        to: toEmail,
        subject: `Invoice #${invoiceNumber}`,
        amount: totalAmount,
        dueDate: dueDate,
        paymentLink: stripePaymentLink
      });

      // Return gracefully - don't block invoice creation
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          details: troubleshooting || 'SendGrid API Error',
          emailLogged: true
        },
        { status: 200 } // Return 200 so invoice creation continues
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
