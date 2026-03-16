import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

export async function POST(request: Request) {
  let toEmail: string = '', toName: string = '', invoiceNumber: string = '', workOrderTitle: string = '', totalAmount: number = 0;
  try {
    const body = await request.json();
    ({
      toEmail,
      toName,
      invoiceNumber,
      workOrderTitle,
      totalAmount,
    } = body);
    const {
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

    const emailHtml = emailLayout({
      title: `Invoice #${invoiceNumber}`,
      preheader: `Invoice #${invoiceNumber} for ${workOrderTitle} — $${finalTotal.toFixed(2)} due`,
      body: `
        <p style="margin:0 0 20px 0;">Hi <strong>${toName.split(' ')[0] || toName}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">Thank you for choosing GroundOps. Please find your invoice below.</p>
        ${infoCard(`
          ${infoRow('Invoice #', invoiceNumber)}
          ${infoRow('Work Order', workOrderTitle)}
          ${infoRow('Customer', toName)}
          ${infoRow('Due Date', dueDate || 'Net 10')}
          ${notes ? infoRow('Notes', notes) : ''}
        `)}
        ${servicesItems.length > 0 ? `
          <p style="margin:20px 0 8px 0;font-size:13px;font-weight:700;color:#5A6C7A;text-transform:uppercase;letter-spacing:0.5px;">Services</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
            <thead><tr style="background:#0D1520;color:#fff;"><th style="padding:9px 12px;text-align:left;">Description</th><th style="padding:9px 12px;text-align:center;">Qty</th><th style="padding:9px 12px;text-align:right;">Unit Price</th><th style="padding:9px 12px;text-align:right;">Amount</th></tr></thead>
            <tbody>${servicesHtml}</tbody>
          </table>
        ` : ''}
        ${materialsItems.length > 0 ? `
          <p style="margin:20px 0 8px 0;font-size:13px;font-weight:700;color:#5A6C7A;text-transform:uppercase;letter-spacing:0.5px;">Materials</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
            <thead><tr style="background:#0D1520;color:#fff;"><th style="padding:9px 12px;text-align:left;">Description</th><th style="padding:9px 12px;text-align:center;">Qty</th><th style="padding:9px 12px;text-align:right;">Unit Price</th><th style="padding:9px 12px;text-align:right;">Amount</th></tr></thead>
            <tbody>${materialsHtml}</tbody>
          </table>
        ` : ''}
        ${paymentFeeItems.length > 0 ? `
          <p style="margin:20px 0 8px 0;font-size:13px;font-weight:700;color:#5A6C7A;text-transform:uppercase;letter-spacing:0.5px;">3.9% Card Payment Fee</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:4px;">
            <thead><tr style="background:#0D1520;color:#fff;"><th style="padding:9px 12px;text-align:left;">Description</th><th style="padding:9px 12px;text-align:center;">Qty</th><th style="padding:9px 12px;text-align:right;">Unit Price</th><th style="padding:9px 12px;text-align:right;">Amount</th></tr></thead>
            <tbody>${paymentFeeHtml}</tbody>
          </table>
          <p style="font-size:12px;color:#8A9CAB;font-style:italic;margin:4px 0 16px 0;">To avoid this fee, pay with cash, Zelle, check, or ACH transfer.</p>
        ` : ''}
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:16px 20px;margin:20px 0;">
          ${materialsSubtotal > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span style="color:#5A6C7A;">Materials subtotal</span><span>$${materialsSubtotal.toFixed(2)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span style="color:#5A6C7A;">Subtotal</span><span>$${subtotalWithPaymentFee.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:2px solid #0D1520;"><span style="font-size:16px;font-weight:700;color:#1A2635;">Amount Due</span><span style="font-size:20px;font-weight:700;color:#2563EB;">$${finalTotal.toFixed(2)}</span></div>
        </div>
        ${stripePaymentLink ? ctaButton('Pay Now', stripePaymentLink) : ''}
      `,
    });

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
    await logEmail({ type: 'invoice', to: toEmail, subject: `Invoice #${invoiceNumber} - Payment Due`, status: 'sent', context: { toName, invoiceNumber, workOrderTitle, totalAmount, dueDate, notes, hasAttachment: !!pdfBase64, hasWorkOrderAttachment: !!workOrderPdfBase64 } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending invoice email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    await logEmail({ type: 'invoice', to: toEmail || '', subject: `Invoice - Payment Due`, status: 'failed', context: { toName, invoiceNumber, workOrderTitle, totalAmount }, error: errorMessage });
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');

    return NextResponse.json(
      {
        error: 'Failed to send invoice email',
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
