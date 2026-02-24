import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';

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

    // Calculate subtotals and separate line items
    let materialsSubtotal = 0;
    let servicesSubtotal = 0;
    let paymentFeeSubtotal = 0;
    const materialsItems: any[] = [];
    const servicesItems: any[] = [];
    const paymentFeeItems: any[] = [];

    if (lineItems && lineItems.length > 0) {
      lineItems.forEach((item: any) => {
        const description = item.description?.toLowerCase() || '';
        // Identify payment fees, materials, and services
        if (description.includes('payment fee') || description.includes('card payment fee') || description.includes('3.9%') || description.includes('processing fee')) {
          paymentFeeItems.push(item);
          paymentFeeSubtotal += item.amount || 0;
        } else if (description.includes('material') || description.includes('parts') || description.includes('supply') || description.includes('switch') || description.includes('component')) {
          materialsItems.push(item);
          materialsSubtotal += item.amount || 0;
        } else {
          servicesItems.push(item);
          servicesSubtotal += item.amount || 0;
        }
      });
    }

    // If no separation found, treat all as services except payment fees
    if (servicesItems.length === 0 && materialsItems.length === 0 && lineItems && lineItems.length > 0) {
      lineItems.forEach((item: any) => {
        const description = item.description?.toLowerCase() || '';
        if (description.includes('payment fee') || description.includes('card payment fee') || description.includes('3.9%') || description.includes('processing fee')) {
          paymentFeeItems.push(item);
          paymentFeeSubtotal += item.amount || 0;
        } else {
          servicesItems.push(item);
          servicesSubtotal += item.amount || 0;
        }
      });
    }

    // Calculate subtotal (services + materials)
    const subtotal = servicesSubtotal + materialsSubtotal;
    // Calculate subtotal with payment fee
    const subtotalWithPaymentFee = subtotal + paymentFeeSubtotal;

    // Final total
    const finalTotal = totalAmount;

    // Build Services HTML
    let servicesHtml = '';
    if (servicesItems.length > 0) {
      servicesHtml = servicesItems.map((item: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.description || 'Service'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${(item.quantity || 1).toFixed(1)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${(item.unitPrice || 0).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${(item.amount || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    // Build Materials HTML
    let materialsHtml = '';
    if (materialsItems.length > 0) {
      materialsHtml = materialsItems.map((item: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.description || 'Material'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${(item.quantity || 1).toFixed(1)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${(item.unitPrice || 0).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${(item.amount || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    // Build Payment Fee HTML
    let paymentFeeHtml = '';
    if (paymentFeeItems.length > 0) {
      paymentFeeHtml = paymentFeeItems.map((item: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.description || '3.9% card payment fee'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${(item.quantity || 1).toFixed(1)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${(item.unitPrice || 0).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${(item.amount || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    // Format service date (use due date if available, otherwise current date)
    const serviceDate = dueDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const serviceDateFormatted = serviceDate;

    // Calculate monthly payment amount (example: divide by 12 months for financing)
    const monthlyPayment = (finalTotal / 12).toFixed(2);

    const LOGO_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/logo.png`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice #${invoiceNumber} due from Cleaning & Maintenance - $${finalTotal.toFixed(2)}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Logo Bar -->
          <div style="background-color: #162040; padding: 16px 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <img src="${LOGO_URL}" alt="GroundOps" style="max-height: 60px; width: auto;" />
          </div>
          <!-- Top Bar -->
          <div style="background-color: #ffffff; padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h1 style="margin: 0; font-size: 16px; font-weight: bold; color: #1f2937;">
                Invoice ${invoiceNumber} due from Cleaning & Maintenance - $${finalTotal.toFixed(2)}
              </h1>
              <div style="display: flex; gap: 10px; align-items: center;">
                <span style="color: #6b7280; font-size: 12px;">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
              </div>
            </div>
          </div>

          <!-- Company Name -->
          <div style="background-color: #ffffff; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 24px; font-weight: bold; color: #1f2937;">
              Cleaning & Maintenance
            </h2>
          </div>

          <!-- Logo -->
          <div style="background-color: #ffffff; padding: 10px 0; text-align: center;"><img src="${LOGO_URL}" alt="GroundOps" style="max-height: 70px; width: auto; display: block; margin: 0 auto;" /></div>

          <!-- Main Heading -->
          <div style="background-color: #ffffff; padding: 0 20px 20px 20px; text-align: center;">
            <h3 style="margin: 0; font-size: 20px; font-weight: bold; color: #1f2937;">
              Your invoice from Cleaning & Maintenance
            </h3>
          </div>

          <!-- Payment Financing Option -->
          <div style="background-color: #e0f2fe; padding: 20px; margin: 0 20px 20px 20px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
              <div>
                <p style="margin: 0; font-size: 16px; font-weight: bold; color: #0369a1;">
                  Pay as low as $${monthlyPayment}/mo*
                </p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #0369a1;">
                  Complete a short application to buy now and pay over time.
                </p>
              </div>
              <a href="#" style="background-color: #0369a1; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; margin-top: 10px;">
                APPLY NOW
              </a>
            </div>
          </div>

          <!-- Invoice Content -->
          <div style="background-color: #ffffff; padding: 20px;">
            <p style="margin: 0 0 15px 0; font-size: 16px; color: #1f2937;">
              Hi ${toName.split(' ')[0] || toName},
            </p>

            <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
              Thank you for choosing Cleaning & Maintenance. Please see attached invoice due net 10.
            </p>

            <!-- Invoice Details -->
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;">
                <strong>Invoice Number:</strong> #${invoiceNumber}
              </p>
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;">
                <strong>Service Date:</strong> ${serviceDateFormatted}
              </p>
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;">
                <strong>Customer Name:</strong> ${toName}
              </p>
              ${notes ? `
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #374151;">
                  ${notes}
                </p>
              ` : ''}
            </div>

            <!-- Services Section -->
            ${servicesItems.length > 0 ? `
              <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold; color: #1f2937;">Services</h4>
                <table style="width: 100%; border-collapse: collapse; background-color: #ffffff;">
                  <thead>
                    <tr style="background-color: #f3f4f6;">
                      <th style="padding: 10px; text-align: left; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">Description</th>
                      <th style="padding: 10px; text-align: center; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">qty</th>
                      <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">unit price</th>
                      <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${servicesHtml}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <!-- Payment Fee Section -->
            ${paymentFeeItems.length > 0 ? `
              <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold; color: #1f2937;">3.9% card payment fee</h4>
                <table style="width: 100%; border-collapse: collapse; background-color: #ffffff;">
                  <thead>
                    <tr style="background-color: #f3f4f6;">
                      <th style="padding: 10px; text-align: left; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">Description</th>
                      <th style="padding: 10px; text-align: center; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">qty</th>
                      <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">unit price</th>
                      <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${paymentFeeHtml}
                  </tbody>
                </table>
                <p style="margin: 10px 0 0 0; font-size: 13px; color: #6b7280; font-style: italic;">
                  If you pay by credit or debit card, a 3.9% processing fee will be added to the total amount. To avoid this fee, you can choose to pay with cash, Zelle, check, or ACH transfer.
                </p>
              </div>
            ` : ''}

            <!-- Materials Section -->
            ${materialsItems.length > 0 ? `
              <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold; color: #1f2937;">Materials</h4>
                <table style="width: 100%; border-collapse: collapse; background-color: #ffffff;">
                  <thead>
                    <tr style="background-color: #f3f4f6;">
                      <th style="padding: 10px; text-align: left; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">Description</th>
                      <th style="padding: 10px; text-align: center; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">qty</th>
                      <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">unit price</th>
                      <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${materialsHtml}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <!-- Summary -->
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-top: 20px;">
              ${materialsSubtotal > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span style="font-size: 14px; color: #374151; font-weight: bold;">Materials subtotal:</span>
                  <span style="font-size: 14px; color: #374151; font-weight: bold;">$${materialsSubtotal.toFixed(2)}</span>
                </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 14px; color: #374151; font-weight: bold;">Subtotal:</span>
                <span style="font-size: 14px; color: #374151; font-weight: bold;">$${subtotalWithPaymentFee.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                <span style="font-size: 16px; color: #1f2937; font-weight: bold;">Total job price:</span>
                <span style="font-size: 16px; color: #1f2937; font-weight: bold;">$${subtotalWithPaymentFee.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 2px solid #1f2937;">
                <span style="font-size: 20px; color: #1f2937; font-weight: bold;">Amount Due:</span>
                <span style="font-size: 24px; color: #1f2937; font-weight: bold;">$${finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <!-- Pay Button -->
          ${stripePaymentLink ? `
            <div style="background-color: #ffffff; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <a href="${stripePaymentLink}" style="background-color: #0369a1; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px; display: inline-block;">
                Pay
              </a>
            </div>
          ` : ''}

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              GroundOps — Facility Maintenance<br>
              Los Angeles, CA<br>
              Phone: <a href="tel:3235551234" style="color: #0369a1; text-decoration: none;">(323) 555-1234</a> | 
              Email: <a href="mailto:info@groundops.com" style="color: #0369a1; text-decoration: none;">info@groundops.com</a> | 
              Website: <a href="https://www.groundops.co/" style="color: #0369a1; text-decoration: none;">groundops.co</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Prepare attachments for Mailgun
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

    await sendEmail({
      to: toEmail,
      subject: `Invoice #${invoiceNumber} - Payment Due`,
      html: emailHtml,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending invoice email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('MAILGUN');
    
    return NextResponse.json(
      {
        error: 'Failed to send invoice email',
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
