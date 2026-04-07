import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, sendEmailsSequentially } from '@/lib/email';
import { collection, getDocs } from 'firebase/firestore';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox, priorityBadge } from '@/lib/email-template';
import { getServerDb } from '@/lib/firebase-server';

export async function POST(request: NextRequest) {
  try {
    const {
      workOrderId,
      workOrderNumber,
      title,
      clientName,
      locationName,
      priority,
      completedBy,
      completionDetails,
    } = await request.json();

    if (!workOrderNumber || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch admin users and filter by workOrderEmailNotifications toggle
    const db = await getServerDb();
    const adminsSnapshot = await getDocs(collection(db, 'adminUsers'));

    const eligibleAdmins = adminsSnapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as any))
      .filter(admin => admin.email && admin.workOrderEmailNotifications === true);

    if (eligibleAdmins.length === 0) {
      return NextResponse.json({ success: true, message: 'No admins with email notifications enabled' });
    }

    const portalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/admin-portal/work-orders${workOrderId ? `/${workOrderId}` : ''}`;

    let sentCount = 0;
    let failedCount = 0;

    await sendEmailsSequentially(
      eligibleAdmins.map((admin) => async () => {
        const adminName = admin.fullName || 'Admin';
        const emailHtml = emailLayout({
          title: 'Work Order Completed',
          preheader: `${workOrderNumber} — ${title} has been completed`,
          body: `
            <p style="margin:0 0 20px 0;">Hello <strong>${adminName}</strong>,</p>
            <p style="margin:0 0 20px 0;color:#5A6C7A;">A work order has been marked as <strong>completed</strong> by the assigned subcontractor.</p>
            ${infoCard(`
              <div style="margin-bottom:12px;">
                <span style="display:inline-block;background:#15803D;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;margin-right:6px;">Completed</span>
                ${priorityBadge(priority || 'medium')}
              </div>
              <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${title}</p>
              ${infoRow('Work Order #', workOrderNumber)}
              ${clientName ? infoRow('Client', clientName) : ''}
              ${locationName ? infoRow('Location', locationName) : ''}
              ${completedBy ? infoRow('Completed by', completedBy) : ''}
              ${completionDetails ? '<p style="margin:12px 0 0 0;padding-top:12px;border-top:1px solid #E2E8F0;font-size:14px;color:#5A6C7A;">' + completionDetails + '</p>' : ''}
            `)}
            ${alertBox('You can now review the work order and generate an invoice if required.', 'info')}
            ${ctaButton('View Work Order', portalLink)}
            <p style="margin:24px 0 0 0;font-size:12px;color:#8A9CAB;">You are receiving this because work order notifications are enabled for your account.</p>
          `,
        });
        const subject = `✅ Work Order Completed: ${workOrderNumber} — ${title}`;
        try {
          await sendEmail({ to: admin.email, subject, html: emailHtml });
          await logEmail({ type: 'work-order-completed-notification', to: admin.email, subject, status: 'sent', context: { workOrderId, workOrderNumber, title, clientName, locationName, priority, completedBy, completionDetails } });
          sentCount++;
          return { success: true };
        } catch (err: any) {
          console.error(`Failed to send completion email to ${admin.email}:`, err.message);
          await logEmail({ type: 'work-order-completed-notification', to: admin.email, subject, status: 'failed', context: { workOrderId, workOrderNumber, title, clientName, locationName, priority, completedBy, completionDetails }, error: err.message });
          failedCount++;
          return { success: false };
        }
      })
    );

    return NextResponse.json({ success: true, sent: sentCount, failed: failedCount });
  } catch (error: any) {
    console.error('Error sending work order completion notification emails:', error);
    return NextResponse.json(
      { error: 'Failed to send completion notification emails', details: error.message },
      { status: 500 }
    );
  }
}
