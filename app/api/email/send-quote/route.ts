import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, emailTotalsSummaryCard } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { toEmail, toName, quoteNumber, workOrderTitle, totalAmount, clientAmount, markupPercentage, lineItems, notes } = body;
    const displayAmount = clientAmount || totalAmount;

    // Separate line items into services and materials
    const serviceItems: any[] = [];
    const materialItems: any[] = [];
    if (lineItems && lineItems.length > 0) {
      lineItems.forEach((item: any) => {
        const desc = (item.description || '').toLowerCase();
        if (desc.includes('material') || desc.includes('parts') || desc.includes('supply')) {
          materialItems.push(item);
        } else {
          serviceItems.push(item);
        }
      });
    }
    const materialsSubtotal = materialItems.reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const subtotal = (lineItems || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);

    const buildRowsHtml = (items: any[]) => items.map((item: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${(item.quantity || 1).toFixed(1)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${(item.unitPrice || 0).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${(item.amount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const tableHtml = (rows: string) => `
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <thead><tr style="background:#0D1520;color:#fff;">
          <th style="padding:9px 12px;text-align:left;">Description</th>
          <th style="padding:9px 12px;text-align:center;">Qty</th>
          <th style="padding:9px 12px;text-align:right;">Unit Price</th>
          <th style="padding:9px 12px;text-align:right;">Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    const emailHtml = emailLayout({
      title: 'New Quote Available for Review',
      preheader: `Quote #${quoteNumber} for ${workOrderTitle} — $${displayAmount.toFixed(2)}`,
      body: `
        <p style="margin:0 0 20px 0;">Hi ${toName ? toName.split(' ')[0] : ''},</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">A quote has been prepared for your service request: <strong>${workOrderTitle}</strong></p>
        ${infoCard(`
          ${infoRow('Quote #', quoteNumber)}
          ${infoRow('Work Order', workOrderTitle)}
          ${infoRow('Customer', toName || '')}
        `)}
        ${serviceItems.length > 0 ? `
          <p style="margin:20px 0 8px 0;font-size:13px;font-weight:700;color:#5A6C7A;text-transform:uppercase;letter-spacing:0.5px;">Services</p>
          ${tableHtml(buildRowsHtml(serviceItems))}
        ` : ''}
        ${materialItems.length > 0 ? `
          <p style="margin:20px 0 8px 0;font-size:13px;font-weight:700;color:#5A6C7A;text-transform:uppercase;letter-spacing:0.5px;">Materials</p>
          ${tableHtml(buildRowsHtml(materialItems))}
        ` : ''}
        ${lineItems && lineItems.length > 0 && serviceItems.length === 0 && materialItems.length === 0 ? `
          ${tableHtml(buildRowsHtml(lineItems))}
        ` : ''}
        ${emailTotalsSummaryCard([
          ...(materialsSubtotal > 0
            ? [{ label: 'Materials subtotal', amount: `$${materialsSubtotal.toFixed(2)}`, variant: 'muted' as const }]
            : []),
          ...(lineItems && lineItems.length > 0
            ? [{ label: 'Subtotal', amount: `$${subtotal.toFixed(2)}`, variant: 'muted' as const }]
            : []),
          { label: 'Total', amount: `$${displayAmount.toFixed(2)}`, variant: 'emphasis' },
        ])}
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
    await logEmail({ type: 'quote', to: '', subject: '', status: 'failed', context: {}, error: error.message || String(error) }).catch(() => {});

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
