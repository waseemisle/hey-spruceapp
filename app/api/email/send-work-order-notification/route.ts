import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, sendEmailsSequentially } from '@/lib/email';
import { collection, getDocs } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';

export async function POST(request: NextRequest) {
  try {
    const {
      workOrderId,
      workOrderNumber,
      title,
      clientName,
      locationName,
      priority,
      workOrderType,
      description,
    } = await request.json();

    if (!workOrderNumber || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = await getServerDb();
    const adminsSnapshot = await getDocs(collection(db, 'adminUsers'));

    const eligibleAdmins = adminsSnapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as any))
      .filter(admin => admin.email && admin.workOrderEmailNotifications !== false);

    if (eligibleAdmins.length === 0) {
      await logEmail({ type: 'work-order-notification', to: '(no eligible admins)', subject: `New Work Order: ${workOrderNumber} — ${title}`, status: 'skipped', context: { workOrderId, workOrderNumber, title, clientName, locationName, priority, workOrderType, reason: 'No admins have workOrderEmailNotifications enabled' } }).catch(() => {});
      return NextResponse.json({ success: true, message: 'No admins with email notifications enabled' });
    }

    const typeLabel =
      workOrderType === 'recurring'
        ? 'Recurring Work Order'
        : workOrderType === 'maintenance'
        ? 'Maintenance Request Work Order'
        : 'Standard Work Order';

    const portalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/admin-portal/work-orders${workOrderId ? `/${workOrderId}` : ''}`;

    let sentCount = 0;
    let failedCount = 0;

    await sendEmailsSequentially(
      eligibleAdmins.map((admin) => async () => {
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
          await sendEmail({ to: admin.email, subject, html: emailHtml });
          await logEmail({ type: 'work-order-notification', to: admin.email, subject, status: 'sent', context: { workOrderId, workOrderNumber, title, clientName, locationName, priority, workOrderType } });
          sentCount++;
          return { success: true };
        } catch (err: any) {
          console.error(`Failed to send email to ${admin.email}:`, err.message);
          await logEmail({ type: 'work-order-notification', to: admin.email, subject, status: 'failed', context: { workOrderId, workOrderNumber, title, clientName, locationName, priority, workOrderType }, error: err.message });
          failedCount++;
          return { success: false };
        }
      })
    );

    return NextResponse.json({ success: true, sent: sentCount, failed: failedCount });
  } catch (error: any) {
    console.error('Error sending work order notification emails:', error);
    await logEmail({ type: 'work-order-notification', to: '', subject: '', status: 'failed', context: {}, error: error.message || String(error) }).catch(() => {});
    return NextResponse.json(
      { error: 'Failed to send work order notification emails', details: error.message },
      { status: 500 }
    );
  }
}
