import { NextResponse } from 'next/server';
import {
  doc,
  getDoc,
  addDoc,
  collection,
  updateDoc,
  serverTimestamp,
  increment,
  arrayUnion,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, getPortalUserProfile, isUserAdmin } from '@/lib/api-verify-firebase';
import { initialsFromName } from '@/lib/support-ticket-helpers';
import { sendEmail, sendEmailsSequentially } from '@/lib/email';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Att = { fileName: string; fileUrl: string; fileType: string; fileSize: number };

function ticketPortalPath(role: string, ticketId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';
  if (role === 'client') return `${base}/client-portal/support-tickets/${ticketId}`;
  if (role === 'subcontractor') return `${base}/subcontractor-portal/support-tickets/${ticketId}`;
  return `${base}/admin-portal/support-tickets/${ticketId}`;
}

function canAccessTicket(data: Record<string, unknown>, uid: string, admin: boolean): boolean {
  if (admin) return true;
  return (
    data.submittedBy === uid || data.clientId === uid || data.subcontractorId === uid
  );
}

export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getServerDb();
    const profile = await getPortalUserProfile(db, uid);
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });

    const admin = await isUserAdmin(db, uid);
    const body = await request.json();
    const { ticketId, body: commentBody, isInternal: rawInternal, attachments: rawAtt } = body as {
      ticketId: string;
      body: string;
      isInternal?: boolean;
      attachments?: Att[];
    };

    if (!ticketId || !commentBody?.trim()) {
      return NextResponse.json({ error: 'ticketId and body required' }, { status: 400 });
    }

    const isInternal = admin && rawInternal === true;
    const ticketRef = doc(db, 'supportTickets', ticketId);
    const ticketSnap = await getDoc(ticketRef);
    if (!ticketSnap.exists()) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    const t = ticketSnap.data() as Record<string, unknown>;
    if (!canAccessTicket(t, uid, admin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const attachments = (rawAtt || []).map((a) => ({
      id: crypto.randomUUID(),
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileType: a.fileType || 'application/octet-stream',
      fileSize: typeof a.fileSize === 'number' ? a.fileSize : 0,
    }));

    const authorName = profile.fullName || profile.email;
    const commentPayload = {
      ticketId,
      body: commentBody.trim(),
      isInternal,
      authorId: uid,
      authorName,
      authorEmail: profile.email,
      authorRole: profile.role,
      authorAvatarInitials: initialsFromName(authorName),
      attachments,
      createdAt: serverTimestamp(),
    };

    const commentRef = await addDoc(
      collection(db, 'supportTickets', ticketId, 'comments'),
      commentPayload,
    );

    const timelineEvent = {
      id: crypto.randomUUID(),
      timestamp: Timestamp.now(),
      type: 'comment-added' as const,
      userId: uid,
      userName: authorName,
      userRole: profile.role,
      details: isInternal ? 'Internal note added' : `Comment added by ${authorName}`,
      metadata: { internal: isInternal, commentId: commentRef.id },
    };

    const updates: Record<string, unknown> = {
      commentCount: increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      timeline: arrayUnion(timelineEvent),
    };

    if (admin && !isInternal && !t.firstResponseAt) {
      updates.firstResponseAt = serverTimestamp();
    }

    await updateDoc(ticketRef, updates);

    const preview = commentBody.trim().slice(0, 300);
    const ticketTitle = (t.title as string) || ticketId;

    // Admin → submitter (non-internal)
    if (admin && !isInternal && (t.submittedByEmail as string)) {
      const subRole = (t.submittedByRole as string) || 'client';
      const link = ticketPortalPath(subRole, ticketId);
      const html = emailLayout({
        title: 'New reply on your support ticket',
        preheader: ticketTitle,
        body: `
          <p style="margin:0 0 16px 0;">Hello <strong>${t.submittedByName || 'there'}</strong>,</p>
          <p style="margin:0 0 16px 0;color:#5A6C7A;">An admin replied to ticket <strong>${ticketId}</strong>.</p>
          ${infoCard(`
            ${infoRow('Ticket', ticketId)}
            ${infoRow('Title', ticketTitle)}
            <p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#1A2635;white-space:pre-wrap;">${preview.replace(/</g, '&lt;')}</p>
          `)}
          ${ctaButton('View ticket', link)}
        `,
      });
      const subject = `Re: Support ticket ${ticketId}`;
      try {
        await sendEmail({ to: t.submittedByEmail as string, subject, html });
        await logEmail({
          type: 'support-ticket-comment',
          to: t.submittedByEmail as string,
          subject,
          status: 'sent',
          context: { ticketId, commentId: commentRef.id },
        });
      } catch (err: any) {
        await logEmail({
          type: 'support-ticket-comment',
          to: t.submittedByEmail as string,
          subject,
          status: 'failed',
          context: { ticketId, commentId: commentRef.id },
          error: err?.message,
        });
      }
    }

    // Client/sub → admins
    if (!admin) {
      const adminsSnap = await getDocs(collection(db, 'adminUsers'));
      const eligible = adminsSnap.docs
        .map((d) => ({ uid: d.id, ...d.data() }) as { uid: string; email?: string; fullName?: string; supportTicketEmailNotifications?: boolean })
        .filter((a) => a.email && a.supportTicketEmailNotifications !== false);

      await sendEmailsSequentially(
        eligible.map((a) => async () => {
          const adminName = a.fullName || 'Admin';
          const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/admin-portal/support-tickets/${ticketId}`;
          const html = emailLayout({
            title: 'New reply on support ticket',
            preheader: ticketTitle,
            body: `
              <p style="margin:0 0 16px 0;">Hello <strong>${adminName}</strong>,</p>
              ${alertBox('The ticket submitter posted a new comment.', 'info')}
              ${infoCard(`
                ${infoRow('Ticket', ticketId)}
                ${infoRow('From', authorName)}
                <p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#1A2635;white-space:pre-wrap;">${preview.replace(/</g, '&lt;')}</p>
              `)}
              ${ctaButton('View ticket', link)}
            `,
          });
          const subject = `Ticket ${ticketId}: new reply from ${authorName}`;
          try {
            await sendEmail({ to: a.email!, subject, html });
            await logEmail({
              type: 'support-ticket-comment',
              to: a.email!,
              subject,
              status: 'sent',
              context: { ticketId, commentId: commentRef.id },
            });
            return { success: true };
          } catch (err: any) {
            await logEmail({
              type: 'support-ticket-comment',
              to: a.email!,
              subject,
              status: 'failed',
              context: { ticketId, commentId: commentRef.id },
              error: err?.message,
            });
            return { success: false };
          }
        }),
      );
    }

    return NextResponse.json({ success: true, commentId: commentRef.id });
  } catch (e: any) {
    console.error('support-tickets/comment', e);
    return NextResponse.json({ error: e?.message || 'Failed to add comment' }, { status: 500 });
  }
}
