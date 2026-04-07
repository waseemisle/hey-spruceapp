import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, sendEmailsSequentially } from '@/lib/email';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';

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
      workOrderId,
      workOrderNumber,
      workOrderTitle,
      clientName,
      subcontractorName,
      quoteAmount,
      locationName,
      locationAddress,
    } = await request.json();

    if (!workOrderNumber || !workOrderTitle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch admin users from Firestore
    const app = getFirebaseApp();
    const auth = getAuth(app);
    if (!auth.currentUser && process.env.FIREBASE_SYNC_EMAIL && process.env.FIREBASE_SYNC_PASSWORD) {
      await setPersistence(auth, inMemoryPersistence);
      await signInWithEmailAndPassword(auth, process.env.FIREBASE_SYNC_EMAIL, process.env.FIREBASE_SYNC_PASSWORD);
    }
    const db = getFirestore(app);
    const adminsSnapshot = await getDocs(collection(db, 'adminUsers'));

    const eligibleAdmins = adminsSnapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as any))
      .filter(admin => admin.email && admin.workOrderEmailNotifications === true);

    if (eligibleAdmins.length === 0) {
      return NextResponse.json({ success: true, message: 'No admins with email notifications enabled' });
    }

    const portalLink = `${APP_URL}/admin-portal/work-orders${workOrderId ? `/${workOrderId}` : ''}`;

    let sentCount = 0;
    let failedCount = 0;

    await sendEmailsSequentially(
      eligibleAdmins.map((admin) => async () => {
        const adminName = admin.fullName || 'Admin';
        const emailHtml = emailLayout({
          title: 'Quote Approved — Work Order Assigned',
          preheader: `${clientName} approved the quote for ${workOrderNumber} — ${workOrderTitle}`,
          body: `
            <p style="margin:0 0 20px 0;">Hello <strong>${adminName}</strong>,</p>
            <p style="margin:0 0 20px 0;color:#5A6C7A;">A client has approved a quote. The work order has been automatically assigned to the subcontractor.</p>
            ${infoCard(`
              <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle}</p>
              ${infoRow('Work Order #', workOrderNumber)}
              ${infoRow('Approved By', clientName)}
              ${infoRow('Assigned To', subcontractorName)}
              ${quoteAmount != null ? infoRow('Quote Amount', `$${Number(quoteAmount).toLocaleString()}`) : ''}
              ${locationName ? infoRow('Location', locationName) : ''}
              ${locationAddress ? infoRow('Address', locationAddress) : ''}
            `)}
            ${alertBox('<strong>Next Steps:</strong> The subcontractor has been notified and will accept the assignment and schedule the service date.', 'success')}
            ${ctaButton('View Work Order', portalLink)}
            <p style="margin:24px 0 0 0;font-size:12px;color:#8A9CAB;">You are receiving this because work order notifications are enabled for your account.</p>
          `,
        });
        const subject = `Quote Approved: ${workOrderNumber} — ${workOrderTitle}`;
        try {
          await sendEmail({ to: admin.email, subject, html: emailHtml });
          await logEmail({
            type: 'quote-approval-admin-notification',
            to: admin.email,
            subject,
            status: 'sent',
            context: { workOrderId, workOrderNumber, workOrderTitle, clientName, subcontractorName, quoteAmount, locationName },
          });
          sentCount++;
          return { success: true };
        } catch (err: any) {
          console.error(`Failed to send quote approval notification to ${admin.email}:`, err.message);
          await logEmail({
            type: 'quote-approval-admin-notification',
            to: admin.email,
            subject,
            status: 'failed',
            context: { workOrderId, workOrderNumber, workOrderTitle, clientName, subcontractorName },
            error: err.message,
          });
          failedCount++;
          return { success: false };
        }
      })
    );

    return NextResponse.json({ success: true, sent: sentCount, failed: failedCount });
  } catch (error: any) {
    console.error('Error sending quote approval admin notification emails:', error);
    return NextResponse.json(
      { error: 'Failed to send quote approval admin notification emails', details: error.message },
      { status: 500 }
    );
  }
}
