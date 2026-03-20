import { NextResponse } from 'next/server';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  addDoc,
  collection,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, isUserAdmin, getPortalUserProfile } from '@/lib/api-verify-firebase';
import { sendEmail } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getServerDb();
    if (!(await isUserAdmin(db, uid))) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const actor = await getPortalUserProfile(db, uid);
    const actorName = actor?.fullName || actor?.email || 'Admin';

    const { ticketId, assignedTo, assignedToName } = (await request.json()) as {
      ticketId: string;
      assignedTo: string;
      assignedToName: string;
    };

    if (!ticketId || !assignedTo) {
      return NextResponse.json({ error: 'ticketId and assignedTo required' }, { status: 400 });
    }

    const assigneeDoc = await getDoc(doc(db, 'adminUsers', assignedTo));
    const assigneeEmail = assigneeDoc.exists() ? (assigneeDoc.data().email as string | undefined) : undefined;
    const name = assignedToName || (assigneeDoc.data()?.fullName as string) || 'Admin';

    const ticketRef = doc(db, 'supportTickets', ticketId);
    const snap = await getDoc(ticketRef);
    if (!snap.exists()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const t = snap.data() as Record<string, unknown>;

    await updateDoc(ticketRef, {
      assignedTo,
      assignedToName: name,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      timeline: arrayUnion({
        id: crypto.randomUUID(),
        timestamp: Timestamp.now(),
        type: 'assigned',
        userId: uid,
        userName: actorName,
        userRole: 'admin',
        details: `Assigned to ${name}`,
        metadata: { assignedTo },
      }),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: assignedTo,
      userRole: 'admin',
      type: 'support_ticket',
      title: 'Support ticket assigned to you',
      message: `${ticketId}: ${t.title || 'Support ticket'}`,
      link: `/admin-portal/support-tickets/${ticketId}`,
      referenceId: ticketId,
      referenceType: 'supportTicket',
      read: false,
      createdAt: serverTimestamp(),
    });

    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';
    const link = `${base}/admin-portal/support-tickets/${ticketId}`;

    if (assigneeEmail) {
      const html = emailLayout({
        title: 'Support ticket assigned',
        preheader: String(t.title || ticketId),
        body: `
          <p style="margin:0 0 16px 0;">Hello <strong>${name}</strong>,</p>
          ${alertBox('A support ticket has been assigned to you.', 'info')}
          ${infoCard(`
            ${infoRow('Ticket', ticketId)}
            ${infoRow('Title', String(t.title || ''))}
            ${infoRow('Priority', String(t.priority || ''))}
          `)}
          ${ctaButton('Open ticket', link)}
        `,
      });
      const subject = `Assigned: ${ticketId} — ${t.title || 'Support ticket'}`;
      try {
        await sendEmail({ to: assigneeEmail, subject, html });
        await logEmail({
          type: 'support-ticket-assigned',
          to: assigneeEmail,
          subject,
          status: 'sent',
          context: { ticketId, assignedTo },
        });
      } catch (err: any) {
        await logEmail({
          type: 'support-ticket-assigned',
          to: assigneeEmail,
          subject,
          status: 'failed',
          context: { ticketId, assignedTo },
          error: err?.message,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('support-tickets/assign', e);
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
