import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, sendEmailsSequentially } from '@/lib/email';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_TYPE_LABELS,
} from '@/lib/support-ticket-helpers';

const getFirebaseApp = () => {
  if (getApps().length === 0) {
    return initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  }
  return getApp();
};

export async function POST(request: NextRequest) {
  try {
    const {
      ticketId,
      ticketNumber,
      title,
      submittedByName,
      submittedByRole,
      category,
      priority,
      type,
      description,
    } = await request.json();

    if (!ticketNumber || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const app = getFirebaseApp();
    const auth = getAuth(app);
    if (!auth.currentUser && process.env.FIREBASE_SYNC_EMAIL && process.env.FIREBASE_SYNC_PASSWORD) {
      await setPersistence(auth, inMemoryPersistence);
      await signInWithEmailAndPassword(auth, process.env.FIREBASE_SYNC_EMAIL, process.env.FIREBASE_SYNC_PASSWORD);
    }
    const db = getFirestore(app);
    const adminsSnapshot = await getDocs(collection(db, 'adminUsers'));

    const eligibleAdmins = adminsSnapshot.docs
      .map((d) => ({ uid: d.id, ...d.data() } as Record<string, unknown> & { uid: string; email?: string; fullName?: string }))
      .filter((admin) => admin.email && admin.supportTicketEmailNotifications === true);

    if (eligibleAdmins.length === 0) {
      return NextResponse.json({ success: true, message: 'No admins with support ticket email notifications enabled' });
    }

    const portalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/admin-portal/support-tickets/${ticketId || ticketNumber}`;

    const catLabel = SUPPORT_CATEGORY_LABELS[String(category)] || String(category || '');
    const typeLabel = SUPPORT_TYPE_LABELS[String(type)] || String(type || '');
    const roleLabel = submittedByRole ? String(submittedByRole).charAt(0).toUpperCase() + String(submittedByRole).slice(1) : '';

    let sentCount = 0;
    let failedCount = 0;

    await sendEmailsSequentially(
      eligibleAdmins.map((admin) => async () => {
        const adminName = (admin.fullName as string) || 'Admin';
        const descHtml = description
          ? `<p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#5A6C7A;white-space:pre-wrap;">${String(description).replace(/</g, '&lt;')}</p>`
          : '';

        const emailHtml = emailLayout({
          title: 'New Support Ticket Submitted',
          preheader: `${ticketNumber} — ${title}`,
          body: `
            <p style="margin:0 0 20px 0;">Hello <strong>${adminName}</strong>,</p>
            ${alertBox('A new support ticket has been submitted and requires your attention.', 'info')}
            ${infoCard(`
              <div style="margin-bottom:12px;">${priorityBadge(priority || 'medium')}</div>
              <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${title}</p>
              ${infoRow('Ticket #', ticketNumber)}
              ${infoRow('Title', title)}
              ${infoRow('Submitted By', submittedByName || '—')}
              ${roleLabel ? infoRow('Role', roleLabel) : ''}
              ${catLabel ? infoRow('Category', catLabel) : ''}
              ${typeLabel ? infoRow('Type', typeLabel) : ''}
              ${infoRow('Priority', (priority || 'medium').toString())}
              ${descHtml}
            `)}
            ${ctaButton('View ticket', portalLink)}
            <p style="margin:24px 0 0 0;font-size:12px;color:#8A9CAB;">You are receiving this because support ticket notifications are enabled for your account.</p>
          `,
        });

        const subject =
          (priority === 'high' || priority === 'urgent' ? '🚨 ' : '') +
          `New support ticket: ${ticketNumber} — ${title}`;

        try {
          await sendEmail({ to: admin.email as string, subject, html: emailHtml });
          await logEmail({
            type: 'support-ticket-notification',
            to: admin.email as string,
            subject,
            status: 'sent',
            context: { ticketId, ticketNumber, title, submittedByName, submittedByRole, category, priority, type },
          });
          sentCount++;
          return { success: true };
        } catch (err: any) {
          console.error(`Failed to send to ${admin.email}:`, err.message);
          await logEmail({
            type: 'support-ticket-notification',
            to: admin.email as string,
            subject,
            status: 'failed',
            context: { ticketId, ticketNumber, title, submittedByName, submittedByRole, category, priority, type },
            error: err.message,
          });
          failedCount++;
          return { success: false };
        }
      }),
    );

    return NextResponse.json({ success: true, sent: sentCount, failed: failedCount });
  } catch (error: any) {
    console.error('send-support-ticket-notification', error);
    return NextResponse.json(
      { error: 'Failed to send support ticket notification emails', details: error.message },
      { status: 500 },
    );
  }
}
