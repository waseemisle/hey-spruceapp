/**
 * Auto-Charge Receipt Email + PDF
 *
 * Called server-side (webhook) after a Stripe Subscription invoice is paid.
 * Generates a PDF receipt and sends it to the client via email.
 */

import { sendEmail } from './email';
import {
  emailLayout,
  infoCard,
  infoRow,
  alertBox,
  divider,
} from './email-template';
import { logEmail } from './email-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoChargeEmailData {
  clientEmail: string;
  clientName: string;
  amount: number;
  invoiceNumber: string;
  chargedAt: Date;
  cardBrand: string;
  cardLast4: string;
  subscriptionAmount: number;
  subscriptionBillingDay: number;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function capFirst(s: string): string {
  if (!s) return 'Card';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── PDF Receipt Generator (server-side / Node.js) ───────────────────────────

async function generateReceiptPDFBase64(data: AutoChargeEmailData): Promise<string | null> {
  try {
    // Dynamic import to avoid SSR issues; jsPDF v2 works in Node.js
    const jsPDFModule = await import('jspdf');
    const JsPDF = (jsPDFModule as any).jsPDF || (jsPDFModule as any).default;

    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // ── Colours ──────────────────────────────────────────────────────────────
    const DARK: [number, number, number] = [13, 21, 32];       // #0D1520
    const ACCENT: [number, number, number] = [217, 119, 6];    // #D97706
    const GREEN: [number, number, number] = [22, 163, 74];     // #16A34A
    const GRAY: [number, number, number] = [100, 116, 139];    // #64748B
    const LGRAY: [number, number, number] = [226, 232, 240];   // #E2E8F0
    const WHITE: [number, number, number] = [255, 255, 255];
    const TEXT: [number, number, number] = [30, 41, 59];       // #1E293B

    // ── Header bar ───────────────────────────────────────────────────────────
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Brand name
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text('GROUNDOPS', 20, 18);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ACCENT);
    doc.text('FACILITY MAINTENANCE INFRASTRUCTURE', 20, 24);

    // "RECEIPT" label on the right
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text('RECEIPT', pageWidth - 20, 22, { align: 'right' });

    // Accent line
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1);
    doc.line(20, 30, pageWidth - 20, 30);

    // ── PAID badge ───────────────────────────────────────────────────────────
    doc.setFillColor(...GREEN);
    doc.roundedRect(20, 48, 55, 16, 3, 3, 'F');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text('✓  PAID', 47, 59, { align: 'center' });

    // Amount (large) — right side
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(fmtMoney(data.amount), pageWidth - 20, 58, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text('Amount Charged', pageWidth - 20, 65, { align: 'right' });

    // ── Separator ────────────────────────────────────────────────────────────
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.4);
    doc.line(20, 72, pageWidth - 20, 72);

    // ── Transaction Details Box ───────────────────────────────────────────────
    let y = 82;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ACCENT);
    doc.text('TRANSACTION DETAILS', 20, y);
    y += 7;

    const rows: [string, string][] = [
      ['Invoice Number:', data.invoiceNumber],
      ['Date Charged:', fmtDateLong(data.chargedAt)],
      ['Payment Method:', `${capFirst(data.cardBrand)} •••• ${data.cardLast4}`],
    ];
    if (data.stripePaymentIntentId) {
      rows.push(['Transaction ID:', data.stripePaymentIntentId]);
    }
    if (data.stripeInvoiceId) {
      rows.push(['Stripe Invoice ID:', data.stripeInvoiceId]);
    }

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(20, y - 4, pageWidth - 40, rows.length * 9 + 8, 2, 2, 'F');

    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEXT);
      doc.text(label, 25, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(value, 80, y + 2);
      y += 9;
    });

    y += 6;

    // ── Billed To ─────────────────────────────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ACCENT);
    doc.text('BILLED TO', 20, y);
    y += 7;

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(20, y - 4, pageWidth - 40, 22, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(data.clientName, 25, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(data.clientEmail, 25, y + 9);

    y += 28;

    // ── Recurring Plan ────────────────────────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ACCENT);
    doc.text('RECURRING AUTO-CHARGE PLAN', 20, y);
    y += 7;

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(20, y - 4, pageWidth - 40, 28, 2, 2, 'F');

    const planRows: [string, string][] = [
      ['Plan Type:', 'Fixed Monthly Auto-Charge (Scenario 1)'],
      ['Monthly Amount:', fmtMoney(data.subscriptionAmount)],
      ['Charge Day:', `${ordinal(data.subscriptionBillingDay)} of every month`],
    ];

    planRows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEXT);
      doc.text(label, 25, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(value, 80, y + 2);
      y += 9;
    });

    y += 8;

    // ── Totals box ────────────────────────────────────────────────────────────
    doc.setFillColor(...GREEN);
    doc.roundedRect(pageWidth - 80, y, 60, 16, 3, 3, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text('TOTAL PAID:', pageWidth - 76, y + 6);
    doc.setFontSize(12);
    doc.text(fmtMoney(data.amount), pageWidth - 24, y + 11, { align: 'right' });

    y += 28;

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFillColor(...DARK);
    doc.rect(0, pageHeight - 22, pageWidth, 22, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ACCENT);
    doc.text('GROUNDOPS', pageWidth / 2, pageHeight - 14, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(138, 156, 171);
    doc.text('info@groundops.co  ·  groundops.co', pageWidth / 2, pageHeight - 8, { align: 'center' });

    // Convert to base64
    const arrayBuffer = doc.output('arraybuffer');
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  } catch (err) {
    console.error('[AutoChargeEmail] PDF generation failed:', err);
    return null;
  }
}

// ─── Email Builder ────────────────────────────────────────────────────────────

function buildEmailHtml(data: AutoChargeEmailData): string {
  const { clientName, amount, invoiceNumber, chargedAt, cardBrand, cardLast4,
    subscriptionAmount, subscriptionBillingDay, stripePaymentIntentId } = data;

  const cardDisplay = `${capFirst(cardBrand)} •••• ${cardLast4}`;

  const body = `
    <p style="margin:0 0 20px 0;">Hi <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 24px 0;">
      Your monthly auto-charge has been processed successfully. A PDF receipt is attached to this email for your records.
    </p>

    ${alertBox(`
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:28px;line-height:1;">✅</div>
        <div>
          <div style="font-size:18px;font-weight:700;color:#15803D;">${fmtMoney(amount)} Charged Successfully</div>
          <div style="font-size:13px;color:#166534;margin-top:2px;">${fmtDateLong(chargedAt)}</div>
        </div>
      </div>
    `, 'success')}

    ${infoCard(`
      <p style="margin:0 0 14px 0;font-size:12px;font-weight:700;color:#5A6C7A;text-transform:uppercase;letter-spacing:0.8px;">Transaction Details</p>
      ${infoRow('Invoice Number:', invoiceNumber)}
      ${infoRow('Date Charged:', fmtDateShort(chargedAt))}
      ${infoRow('Amount:', fmtMoney(amount))}
      ${infoRow('Payment Card:', cardDisplay)}
      ${stripePaymentIntentId ? infoRow('Transaction ID:', `<span style="font-family:monospace;font-size:12px;">${stripePaymentIntentId}</span>`) : ''}
    `)}

    ${infoCard(`
      <p style="margin:0 0 14px 0;font-size:12px;font-weight:700;color:#5A6C7A;text-transform:uppercase;letter-spacing:0.8px;">Your Auto-Charge Plan</p>
      ${infoRow('Plan Type:', 'Fixed Monthly Auto-Charge')}
      ${infoRow('Monthly Amount:', fmtMoney(subscriptionAmount))}
      ${infoRow('Billing Day:', `${ordinal(subscriptionBillingDay)} of every month`)}
      ${infoRow('Status:', '<span style="color:#16A34A;font-weight:700;">Active</span>')}
    `)}

    ${divider()}

    <p style="font-size:13px;color:#5A6C7A;margin:0 0 8px 0;">
      Your PDF receipt is attached to this email. Please keep it for your records.
    </p>
    <p style="font-size:13px;color:#5A6C7A;margin:0;">
      Questions about this charge? Contact us at
      <a href="mailto:info@groundops.co" style="color:#D97706;text-decoration:none;">info@groundops.co</a>
    </p>
  `;

  return emailLayout({
    title: `Auto-Charge Receipt — ${fmtMoney(amount)}`,
    preheader: `${fmtMoney(amount)} auto-charged on ${fmtDateShort(chargedAt)} from ${cardDisplay}`,
    body,
  });
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function sendAutoChargeReceiptEmail(data: AutoChargeEmailData): Promise<void> {
  const { clientEmail, clientName, amount, invoiceNumber } = data;

  let emailId: string | undefined;
  let emailError: string | undefined;

  try {
    const html = buildEmailHtml(data);

    // Generate PDF receipt (server-side)
    const pdfBase64 = await generateReceiptPDFBase64(data);
    const attachments: { filename: string; content: string }[] = [];
    if (pdfBase64) {
      attachments.push({
        filename: `receipt-${invoiceNumber}.pdf`,
        content: pdfBase64,
      });
      console.log(`[AutoChargeEmail] PDF generated for invoice ${invoiceNumber}`);
    } else {
      console.warn(`[AutoChargeEmail] PDF skipped for invoice ${invoiceNumber}, sending email without attachment`);
    }

    const result = await sendEmail({
      to: clientEmail,
      subject: `Payment Receipt — ${fmtMoney(amount)} Auto-Charged`,
      html,
      attachments,
    });

    emailId = result.id;
    console.log(`[AutoChargeEmail] Receipt sent to ${clientEmail} for invoice ${invoiceNumber}`);
  } catch (err: any) {
    emailError = err?.message || String(err);
    console.error(`[AutoChargeEmail] Failed to send receipt for invoice ${invoiceNumber}:`, err);
    // Don't rethrow — email failure should never break the webhook
  }

  // Log to Firestore
  await logEmail({
    type: 'auto-charge-receipt',
    to: clientEmail,
    subject: `Payment Receipt — ${fmtMoney(amount)} Auto-Charged`,
    status: emailError ? 'failed' : 'sent',
    context: {
      clientName,
      invoiceNumber,
      amount,
      chargedAt: data.chargedAt.toISOString(),
      cardBrand: data.cardBrand,
      cardLast4: data.cardLast4,
      stripePaymentIntentId: data.stripePaymentIntentId,
    },
    ...(emailError ? { error: emailError } : {}),
  });
}
