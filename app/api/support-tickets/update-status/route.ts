import { NextResponse } from 'next/server';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, isUserAdmin, getPortalUserProfile } from '@/lib/api-verify-firebase';
import type { SupportTicketStatus } from '@/types';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';
import { SUPPORT_STATUS_LABELS } from '@/lib/support-ticket-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function portalForSubmitter(role: string, ticketId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';
  if (role === 'client') return `${base}/client-portal/support-tickets/${ticketId}`;
  if (role === 'subcontractor') return `${base}/subcontractor-portal/support-tickets/${ticketId}`;
  return `${base}/admin-portal/support-tickets/${ticketId}`;
}

export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getServerDb();
    if (!(await isUserAdmin(db, uid))) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const profile = await getPortalUserProfile(db, uid);
    const actorName = profile?.fullName || profile?.email || 'Admin';

    const { ticketId, status: newStatus, internalNotes } = (await request.json()) as {
      ticketId: string;
      status: SupportTicketStatus;
      internalNotes?: string;
    };

    if (!ticketId || !newStatus) {
      return NextResponse.json({ error: 'ticketId and status required' }, { status: 400 });
    }

    const ticketRef = doc(db, 'supportTickets', ticketId);
    const snap = await getDoc(ticketRef);
    if (!snap.exists()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const t = snap.data() as Record<string, unknown>;
    const fromStatus = t.status as SupportTicketStatus;

    const statusEvent = {
      id: crypto.randomUUID(),
      timestamp: Timestamp.now(),
      type: 'status-changed' as const,
      userId: uid,
      userName: actorName,
      userRole: 'admin' as const,
      details: `Status changed from ${SUPPORT_STATUS_LABELS[fromStatus] || fromStatus} to ${SUPPORT_STATUS_LABELS[newStatus] || newStatus}`,
      metadata: { fromStatus, toStatus: newStatus },
    };

    const updates: Record<string, unknown> = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      timeline: arrayUnion(statusEvent),
    };

    if (internalNotes !== undefined) {
      updates.internalNotes = internalNotes;
    }

    if (newStatus === 'resolved') {
      updates.resolvedAt = serverTimestamp();
    }
    if (newStatus === 'closed') {
      updates.closedAt = serverTimestamp();
    }

    const reopening =
      (fromStatus === 'resolved' || fromStatus === 'closed') &&
      newStatus !== 'resolved' &&
      newStatus !== 'closed';

    if (reopening) {
      updates.resolvedAt = deleteField();
      updates.closedAt = deleteField();
    }

    await updateDoc(ticketRef, updates);

    if (reopening) {
      await updateDoc(ticketRef, {
        timeline: arrayUnion({
          id: crypto.randomUUID(),
          timestamp: Timestamp.now(),
          type: 'reopened' as const,
          userId: uid,
          userName: actorName,
          userRole: 'admin' as const,
          details: 'Ticket reopened',
          metadata: { fromStatus },
        }),
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      });
    }

    const email = t.submittedByEmail as string | undefined;
    if (email) {
      const role = (t.submittedByRole as string) || 'client';
      const link = portalForSubmitter(role, ticketId);
      const html = emailLayout({
        title: 'Support ticket status updated',
        preheader: String(t.title || ticketId),
        body: `
          <p style="margin:0 0 16px 0;">Hello <strong>${t.submittedByName || 'there'}</strong>,</p>
          ${alertBox(
            `Your ticket <strong>${ticketId}</strong> status is now <strong>${SUPPORT_STATUS_LABELS[newStatus] || newStatus}</strong>.`,
            'info',
          )}
          ${infoCard(`
            ${infoRow('Ticket', String(t.ticketNumber || ticketId))}
            ${infoRow('Previous', SUPPORT_STATUS_LABELS[fromStatus] || String(fromStatus))}
            ${infoRow('New status', SUPPORT_STATUS_LABELS[newStatus] || String(newStatus))}
          `)}
          ${ctaButton('View ticket', link)}
        `,
      });
      const subject = `Ticket ${ticketId}: ${SUPPORT_STATUS_LABELS[newStatus] || newStatus}`;
      try {
        await sendEmail({ to: email, subject, html });
        await logEmail({
          type: 'support-ticket-status-change',
          to: email,
          subject,
          status: 'sent',
          context: { ticketId, fromStatus, toStatus: newStatus },
        });
      } catch (err: any) {
        await logEmail({
          type: 'support-ticket-status-change',
          to: email,
          subject,
          status: 'failed',
          context: { ticketId, fromStatus, toStatus: newStatus },
          error: err?.message,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('support-tickets/update-status', e);
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
