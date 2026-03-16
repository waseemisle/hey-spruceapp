import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';

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
      title,
      clientName,
      locationName,
      priority,
      workOrderType, // 'standard' | 'recurring' | 'maintenance'
      description,
    } = await request.json();

    if (!workOrderNumber || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch admin users from Firestore and filter by workOrderEmailNotifications toggle
    const app = getFirebaseApp();
    const db = getFirestore(app);
    const adminsSnapshot = await getDocs(collection(db, 'adminUsers'));

    const eligibleAdmins = adminsSnapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as any))
      .filter(admin => admin.email && admin.workOrderEmailNotifications !== false);

    if (eligibleAdmins.length === 0) {
      return NextResponse.json({ success: true, message: 'No admins with email notifications enabled' });
    }

    const typeLabel =
      workOrderType === 'recurring'
        ? 'Recurring Work Order'
        : workOrderType === 'maintenance'
        ? 'Maintenance Request Work Order'
        : 'Standard Work Order';

    const portalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/admin-portal/work-orders${workOrderId ? `/${workOrderId}` : ''}`;

    const errors: string[] = [];

    await Promise.all(
      eligibleAdmins.map(async (admin) => {
        const adminName = admin.fullName || 'Admin';

        const emailHtml = emailLayout({
          title: 'New Work Order Created',
          preheader: `${workOrderNumber} — ${title}`,
          body: `
            <p style="margin:0 0 20px 0;">Hello <strong>${adminName}</strong>,</p>
            <p style="margin:0 0 20px 0;color:#5A6C7A;">A new work order has been created and requires your review.</p>
            ${infoCard(`
              <div style="margin-bottom:12px;">
                <span style="display:inline-block;background:#1E40AF;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;margin-right:6px;">${typeLabel}</span>
                ${priorityBadge(priority || 'medium')}
              </div>
              <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${title}</p>
              ${infoRow('Work Order #', workOrderNumber)}
              ${clientName ? infoRow('Client', clientName) : ''}
              ${locationName ? infoRow('Location', locationName) : ''}
              ${description ? '<p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#5A6C7A;">' + description + '</p>' : ''}
            `)}
            ${(priority === 'high' || priority === 'urgent') ? alertBox('<strong>HIGH PRIORITY</strong> — This work order requires immediate attention.', 'warning') : ''}
            ${ctaButton('View Work Order', portalLink)}
            <p style="margin:24px 0 0 0;font-size:12px;color:#8A9CAB;">You are receiving this because work order notifications are enabled for your account.</p>
          `,
        });

        const subject = `${priority === 'high' || priority === 'urgent' ? '🚨 ' : ''}New Work Order: ${workOrderNumber} — ${title}`;
        try {
          await sendEmail({
            to: admin.email,
            subject,
            html: emailHtml,
          });
          await logEmail({ type: 'work-order-notification', to: admin.email, subject, status: 'sent', context: { workOrderId, workOrderNumber, title, clientName, locationName, priority, workOrderType } });
        } catch (err: any) {
          console.error(`Failed to send email to ${admin.email}:`, err.message);
          errors.push(admin.email);
          await logEmail({ type: 'work-order-notification', to: admin.email, subject, status: 'failed', context: { workOrderId, workOrderNumber, title, clientName, locationName, priority, workOrderType }, error: err.message });
        }
      })
    );

    return NextResponse.json({
      success: true,
      sent: eligibleAdmins.length - errors.length,
      failed: errors.length,
    });
  } catch (error: any) {
    console.error('Error sending work order notification emails:', error);
    return NextResponse.json(
      { error: 'Failed to send work order notification emails', details: error.message },
      { status: 500 }
    );
  }
}
