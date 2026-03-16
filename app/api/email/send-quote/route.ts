import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

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

    const emailHtml = emailLayout({
      title: 'New Quote Available for Review',
      preheader: `Quote #${quoteNumber} for ${workOrderTitle} — $${clientAmount ? clientAmount.toFixed(2) : totalAmount.toFixed(2)}`,
      body: `
        <p style="margin:0 0 20px 0;">Hi,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">A quote has been prepared for your service request: <strong>${workOrderTitle}</strong></p>
        ${infoCard(`
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle}</p>
          ${infoRow('Quote #', quoteNumber)}
          ${clientAmount ? infoRow('Total', '$' + clientAmount.toFixed(2)) : infoRow('Total', '$' + totalAmount.toFixed(2))}
        `)}
        ${lineItems && lineItems.length > 0 ? `
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
            <thead>
              <tr style="background:#0D1520;color:#ffffff;">
                <th style="padding:10px 12px;text-align:left;border-radius:4px 0 0 0;">Description</th>
                <th style="padding:10px 12px;text-align:center;">Qty</th>
                <th style="padding:10px 12px;text-align:right;">Unit Price</th>
                <th style="padding:10px 12px;text-align:right;border-radius:0 4px 0 0;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
            </tbody>
            <tfoot>
              <tr style="background:#F8FAFC;">
                <td colspan="3" style="padding:10px 12px;font-weight:700;color:#1A2635;">Total</td>
                <td style="padding:10px 12px;text-align:right;font-weight:700;color:#2563EB;font-size:16px;">$${(clientAmount || totalAmount).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        ` : ''}
        ${notes ? alertBox(notes, 'info') : ''}
        ${ctaButton('Review & Approve Quote', APP_URL + '/client-portal')}
      `,
    });

    await sendEmail({
      to: toEmail,
      subject: `Quote #${quoteNumber} - ${workOrderTitle}`,
      html: emailHtml,
    });
    await logEmail({ type: 'quote', to: toEmail, subject: `Quote #${quoteNumber} - ${workOrderTitle}`, status: 'sent', context: { toName, quoteNumber, workOrderTitle, totalAmount, clientAmount, markupPercentage, notes } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending quote email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');

    return NextResponse.json(
      {
        error: 'Failed to send quote email',
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
