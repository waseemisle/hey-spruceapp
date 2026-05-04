/**
 * Margin Edge integration — forward Hey Spruce invoices to a client's
 * Margin Edge AP inbox so their AP/invoice-capture pipeline picks them up
 * without ops manually forwarding from Gmail.
 *
 * Configuration:
 *   companies/{id}.marginEdgeEnabled       (boolean toggle, gates the feature)
 *   companies/{id}.marginEdgeInvoiceEmail  (string — company-level default inbox)
 *   locations/{id}.marginEdgeEmail         (string — per-location override)
 *
 * Resolution order for the recipient:
 *   1. The location's marginEdgeEmail (per-restaurant inbox)
 *   2. Falls back to the company-level marginEdgeInvoiceEmail
 *
 * Trigger: ADMIN APPROVAL. The admin reviews a draft invoice and clicks
 * "Approve & Forward to Margin Edge". This is intentionally decoupled
 * from the customer-facing /api/email/send-invoice route — the customer
 * email is a separate, later step. Approval pushes to ME for AP
 * processing; "Send" delivers to the client.
 *
 * Idempotency: persisted on the invoice doc as
 *   invoices/{id}.marginEdgeSentAt       (Timestamp)
 *   invoices/{id}.marginEdgeMessageId    (Mailgun id)
 *   invoices/{id}.marginEdgeSentTo       (string — the ME address used)
 *   invoices/{id}.marginEdgeError        (string — set on failure)
 *
 * Re-clicking Approve checks marginEdgeSentAt and skips. ME never
 * receives a duplicate.
 *
 * Reference: https://help.marginedge.com/hc/en-us/articles/218822667-Uploading-Invoices
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  serverTimestamp,
  updateDoc,
  Firestore,
} from 'firebase/firestore';
import { getServerDb } from './firebase-server';
import { sendEmail } from './email';
import { logEmail } from './email-logger';

interface ResolveInput {
  invoiceId?: string;
  invoiceNumber?: string;
}

interface ResolvedTarget {
  invoiceId: string;
  invoiceData: any;
  marginEdgeEmail: string;
  companyName: string;
  alreadySent: boolean;
}

/**
 * Walk invoice → workOrder → location → company to find the Margin Edge
 * inbox configured for the parent company. Returns null when:
 *   • the invoice / WO / location / company chain breaks
 *   • the company doesn't have marginEdgeEnabled
 *   • marginEdgeInvoiceEmail is missing or empty
 *
 * `alreadySent` flags an invoice whose marginEdgeSentAt is already
 * populated, so the caller can short-circuit without re-sending.
 */
export async function resolveMarginEdgeTarget(
  input: ResolveInput,
  dbInstance?: Firestore,
): Promise<ResolvedTarget | null> {
  try {
    const db = dbInstance || (await getServerDb());

    let invoiceId = (input.invoiceId || '').trim();
    let invoiceData: any = null;
    if (invoiceId) {
      const snap = await getDoc(doc(db, 'invoices', invoiceId));
      if (snap.exists()) invoiceData = snap.data();
    }
    if (!invoiceData && input.invoiceNumber) {
      const q = query(
        collection(db, 'invoices'),
        where('invoiceNumber', '==', input.invoiceNumber),
        limit(1),
      );
      const qs = await getDocs(q);
      if (!qs.empty) {
        invoiceId = qs.docs[0].id;
        invoiceData = qs.docs[0].data();
      }
    }
    if (!invoiceData || !invoiceId) return null;

    const workOrderId = (invoiceData.workOrderId || '').toString().trim();
    if (!workOrderId) return null;

    const woSnap = await getDoc(doc(db, 'workOrders', workOrderId));
    if (!woSnap.exists()) return null;
    const wo = woSnap.data();

    // Always look up the location — needed both for companyId fallback AND
    // for the per-location marginEdgeEmail override. We accept the round-
    // trip cost because the routing decision needs both.
    let companyId = ((wo as any).companyId || '').toString().trim();
    let locationData: any = null;
    const locationId = (wo.locationId || '').toString().trim();
    if (locationId) {
      const locSnap = await getDoc(doc(db, 'locations', locationId));
      if (locSnap.exists()) {
        locationData = locSnap.data();
        if (!companyId) companyId = (locationData.companyId || '').toString().trim();
      }
    }
    if (!companyId) return null;

    const compSnap = await getDoc(doc(db, 'companies', companyId));
    if (!compSnap.exists()) return null;
    const company = compSnap.data();
    if (company.marginEdgeEnabled !== true) return null;

    // Recipient resolution: prefer the per-location override; fall back to
    // the company-level default. This is the heart of "send to per-location
    // MarginEdge inbox by location" — different restaurants get different
    // inboxes via the locations doc, with the company doc as the safety net.
    const locationOverride = (locationData?.marginEdgeEmail || '').toString().trim();
    const companyDefault = (company.marginEdgeInvoiceEmail || '').toString().trim();
    const marginEdgeEmail = locationOverride || companyDefault;
    if (!marginEdgeEmail) return null;

    return {
      invoiceId,
      invoiceData,
      marginEdgeEmail,
      companyName: (company.name || '').toString().trim() || 'Company',
      alreadySent: !!invoiceData.marginEdgeSentAt,
    };
  } catch (err) {
    console.warn('[margin-edge] resolveMarginEdgeTarget failed (non-fatal):', err);
    return null;
  }
}

interface SendInput extends ResolveInput {
  /** Base64 PDF — the same one attached to the customer invoice email. */
  pdfBase64?: string;
  workOrderTitle?: string;
  totalAmount?: number;
  dueDate?: string;
  /** Vendor (subcontractor) business name for the ME ingestion subject. */
  vendorName?: string;
}

/**
 * Send the invoice to the company's Margin Edge inbox. Designed for the
 * Margin Edge parser, not a human reader:
 *   • Plain subject "Invoice {number} — {vendor} — {WO}"
 *   • Minimal HTML body summarizing the invoice (ME reads PDF, we add the
 *     metadata for human ops in the ME app spotting it)
 *   • PDF attached
 *
 * Idempotent — short-circuits when invoices/{id}.marginEdgeSentAt exists.
 * Fail-soft — logs and writes marginEdgeError on the invoice doc, never
 * throws.
 */
export async function sendInvoiceToMarginEdge(input: SendInput): Promise<{
  attempted: boolean;
  sent?: boolean;
  skipped?: 'not_enabled' | 'already_sent' | 'no_pdf';
  messageId?: string | null;
  error?: string;
}> {
  const db = await getServerDb();
  const target = await resolveMarginEdgeTarget(
    { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
    db,
  );

  if (!target) {
    return { attempted: false, skipped: 'not_enabled' };
  }

  if (target.alreadySent) {
    return { attempted: false, skipped: 'already_sent' };
  }

  // ME ingests the PDF. If the caller didn't pass one (e.g. the invoice
  // email path that doesn't generate a PDF), we record the gap and skip.
  // The customer-facing email will have surfaced this case separately.
  if (!input.pdfBase64) {
    return { attempted: false, skipped: 'no_pdf' };
  }

  const invoiceNumber =
    (target.invoiceData.invoiceNumber as string) || input.invoiceNumber || target.invoiceId.slice(-8).toUpperCase();
  const vendor = (input.vendorName || target.invoiceData.subcontractorName || 'GroundOps').toString();
  const workOrderTitle = (input.workOrderTitle || target.invoiceData.workOrderTitle || 'Service').toString();
  const total = Number(input.totalAmount ?? target.invoiceData.totalAmount ?? 0);
  const dueDate = input.dueDate || '';

  const subject = `Invoice ${invoiceNumber} — ${vendor} — ${workOrderTitle}`;

  // Plain, parser-friendly HTML body. No CTAs, no marketing chrome —
  // ME's parser is the audience here, not a customer.
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size:14px; color:#222; line-height:1.55;">
      <p>Vendor invoice attached for processing.</p>
      <table style="border-collapse:collapse; font-size:13px; margin-top:8px;">
        <tr><td style="padding:2px 16px 2px 0; color:#666;">Invoice #</td><td style="padding:2px 0;"><strong>${invoiceNumber}</strong></td></tr>
        <tr><td style="padding:2px 16px 2px 0; color:#666;">Vendor</td><td style="padding:2px 0;">${vendor}</td></tr>
        <tr><td style="padding:2px 16px 2px 0; color:#666;">Work Order</td><td style="padding:2px 0;">${workOrderTitle}</td></tr>
        <tr><td style="padding:2px 16px 2px 0; color:#666;">Customer</td><td style="padding:2px 0;">${target.companyName}</td></tr>
        <tr><td style="padding:2px 16px 2px 0; color:#666;">Amount</td><td style="padding:2px 0;">$${total.toFixed(2)}</td></tr>
        ${dueDate ? `<tr><td style="padding:2px 16px 2px 0; color:#666;">Due</td><td style="padding:2px 0;">${dueDate}</td></tr>` : ''}
      </table>
      <p style="color:#999; font-size:11px; margin-top:16px;">Auto-forwarded by Ground Ops to Margin Edge.</p>
    </div>
  `;

  try {
    const result = await sendEmail({
      to: target.marginEdgeEmail,
      subject,
      html,
      attachments: [
        {
          content: input.pdfBase64,
          filename: `Invoice_${invoiceNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    });

    // Persist idempotency markers + audit so the admin invoice detail page
    // can show "Sent to Margin Edge at X" and we can correlate to ME's
    // ingestion if they ever ask for evidence.
    await updateDoc(doc(db, 'invoices', target.invoiceId), {
      marginEdgeSentAt: serverTimestamp(),
      marginEdgeMessageId: result?.id || null,
      marginEdgeSentTo: target.marginEdgeEmail,
      marginEdgeError: null,
    }).catch((e) => console.warn('[margin-edge] failed to persist sentAt (non-fatal):', e));

    await logEmail({
      type: 'invoice',
      to: target.marginEdgeEmail,
      subject,
      status: 'sent',
      context: {
        integration: 'margin-edge',
        invoiceId: target.invoiceId,
        invoiceNumber,
        companyName: target.companyName,
        messageId: result?.id || null,
      },
    });

    return { attempted: true, sent: true, messageId: result?.id || null };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[margin-edge] send failed:', message);

    await updateDoc(doc(db, 'invoices', target.invoiceId), {
      marginEdgeError: message,
    }).catch(() => {});

    await logEmail({
      type: 'invoice',
      to: target.marginEdgeEmail,
      subject,
      status: 'failed',
      context: { integration: 'margin-edge', invoiceId: target.invoiceId, invoiceNumber, companyName: target.companyName },
      error: message,
    }).catch(() => {});

    return { attempted: true, sent: false, error: message };
  }
}
