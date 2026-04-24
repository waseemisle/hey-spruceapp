import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';
import { getServerDb } from '@/lib/firebase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

/**
 * Fire-and-forget fan-out for a subcontractor-submitted Diagnostic Request:
 *   - writes in-app notifications for all admins AND for the client
 *   - emails the client (if we have their address) and each admin
 *
 * Diagnostic Requests skip admin markup, so admins are informed, not asked to act.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      clientId,
      clientEmail,
      clientName,
      workOrderId,
      workOrderNumber,
      workOrderTitle,
      subcontractorName,
      diagnosticFee,
      proposedServiceDate,
      proposedServiceTime,
    } = await request.json();

    if (!workOrderId || !workOrderNumber || !subcontractorName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = await getServerDb();
    const feeStr = `$${Number(diagnosticFee || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ── In-app notifications ─────────────────────────────────────────
    const adminsSnap = await getDocs(collection(db, 'adminUsers'));
    const adminIds: string[] = [];
    const adminEmails: { email: string; name: string }[] = [];
    adminsSnap.docs.forEach(d => {
      const data = d.data();
      adminIds.push(d.id);
      if (data.email && data.workOrderEmailNotifications !== false) {
        adminEmails.push({ email: data.email, name: data.fullName || 'Admin' });
      }
    });

    // Admin notification — informational, no action required
    for (const adminId of adminIds) {
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: adminId,
          userRole: 'admin',
          type: 'diagnostic_request',
          title: 'Diagnostic Request Received',
          message: `${subcontractorName} submitted a Diagnostic Request (${feeStr}) for WO ${workOrderNumber} — sent directly to client.`,
          link: `/admin-portal/work-orders/${workOrderId}`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to create admin notification:', e);
      }
    }

    // Client notification — action required (approve the diagnostic fee)
    if (clientId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: clientId,
          userRole: 'client',
          type: 'diagnostic_request',
          title: 'Diagnostic Request Received',
          message: `${subcontractorName} submitted a Diagnostic Request of ${feeStr} for WO ${workOrderNumber}. Please review and approve.`,
          link: `/client-portal/diagnostic-requests`,
          referenceId: workOrderId,
          referenceType: 'workOrder',
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to create client notification:', e);
      }
    }

    // ── Emails ───────────────────────────────────────────────────────
    const formattedDate = proposedServiceDate
      ? new Date(proposedServiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    // Email the client
    if (clientEmail) {
      try {
        const html = emailLayout({
          title: 'Diagnostic Request Received',
          preheader: `${subcontractorName} submitted a Diagnostic Request for ${workOrderTitle || workOrderNumber}`,
          body: `
            <p style="margin:0 0 20px 0;">Hello ${clientName || 'there'},</p>
            <p style="margin:0 0 20px 0;color:#5A6C7A;">A subcontractor has submitted a <strong>Diagnostic Request</strong> for your review.</p>
            ${infoCard(`
              <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle || workOrderNumber}</p>
              ${infoRow('Work Order #', workOrderNumber)}
              ${infoRow('Submitted by', subcontractorName)}
              ${infoRow('Diagnostic Fee', feeStr)}
              ${formattedDate ? infoRow('Proposed Date', formattedDate + (proposedServiceTime ? ' at ' + proposedServiceTime : '')) : ''}
            `)}
            ${alertBox('Approve the diagnostic fee so the subcontractor can inspect the job and submit a repair quote.', 'info')}
            ${ctaButton('Review Diagnostic Request', APP_URL + '/client-portal/diagnostic-requests')}
          `,
        });
        await sendEmail({
          to: clientEmail,
          subject: `Diagnostic Request Received for Work Order ${workOrderNumber}`,
          html,
        });
        await logEmail({
          type: 'diagnostic-request-notification',
          to: clientEmail,
          subject: `Diagnostic Request Received for Work Order ${workOrderNumber}`,
          status: 'sent',
          context: { clientName, workOrderNumber, workOrderTitle, subcontractorName, diagnosticFee },
        });
      } catch (e: any) {
        await logEmail({ type: 'diagnostic-request-notification', to: clientEmail, subject: '', status: 'failed', context: {}, error: e.message }).catch(() => {});
      }
    }

    // Email admins
    for (const admin of adminEmails) {
      try {
        const html = emailLayout({
          title: 'Diagnostic Request Received',
          preheader: `${subcontractorName} submitted a Diagnostic Request — sent directly to the client`,
          body: `
            <p style="margin:0 0 20px 0;">Hello <strong>${admin.name}</strong>,</p>
            <p style="margin:0 0 20px 0;color:#5A6C7A;">A Diagnostic Request has been submitted. It has been sent directly to the client for approval — no admin action is required.</p>
            ${infoCard(`
              <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle || workOrderNumber}</p>
              ${infoRow('Work Order #', workOrderNumber)}
              ${infoRow('Submitted by', subcontractorName)}
              ${infoRow('Diagnostic Fee', feeStr)}
              ${formattedDate ? infoRow('Proposed Date', formattedDate + (proposedServiceTime ? ' at ' + proposedServiceTime : '')) : ''}
            `)}
            ${alertBox('This Diagnostic Request is awaiting client approval. Once approved, the subcontractor will submit a repair quote for your markup.', 'info')}
            ${ctaButton('View Work Order', APP_URL + '/admin-portal/work-orders/' + workOrderId)}
          `,
        });
        await sendEmail({
          to: admin.email,
          subject: `Diagnostic Request Received: ${workOrderTitle || workOrderNumber}`,
          html,
        });
        await logEmail({
          type: 'diagnostic-request-notification',
          to: admin.email,
          subject: `Diagnostic Request Received: ${workOrderTitle || workOrderNumber}`,
          status: 'sent',
          context: { toName: admin.name, workOrderNumber, workOrderTitle, subcontractorName, diagnosticFee },
        });
      } catch (e: any) {
        await logEmail({ type: 'diagnostic-request-notification', to: admin.email, subject: '', status: 'failed', context: {}, error: e.message }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, adminsNotified: adminIds.length, clientNotified: Boolean(clientId) });
  } catch (error: any) {
    console.error('Error fanning out Diagnostic Request notifications:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
