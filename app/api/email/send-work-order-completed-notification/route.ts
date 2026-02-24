import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
      completedBy,
      completionDetails,
    } = await request.json();

    if (!workOrderNumber || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch admin users and filter by workOrderEmailNotifications toggle
    const app = getFirebaseApp();
    const db = getFirestore(app);
    const adminsSnapshot = await getDocs(collection(db, 'adminUsers'));

    const eligibleAdmins = adminsSnapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as any))
      .filter(admin => admin.email && admin.workOrderEmailNotifications !== false);

    if (eligibleAdmins.length === 0) {
      return NextResponse.json({ success: true, message: 'No admins with email notifications enabled' });
    }

    const priorityColor =
      priority === 'high' || priority === 'urgent'
        ? '#ef4444'
        : priority === 'medium'
        ? '#f59e0b'
        : '#10b981';

    const priorityLabel = priority
      ? priority.charAt(0).toUpperCase() + priority.slice(1)
      : 'Medium';

    const portalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app'}/admin-portal/work-orders${workOrderId ? `/${workOrderId}` : ''}`;

    const errors: string[] = [];

    await Promise.all(
      eligibleAdmins.map(async (admin) => {
        const adminName = admin.fullName || 'Admin';

        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Work Order Completed</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #065f46 0%, #10b981 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <div style="font-size: 40px; margin-bottom: 8px;">✅</div>
                <h1 style="color: white; margin: 0; font-size: 26px;">Work Order Completed</h1>
                <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 15px;">${workOrderNumber}</p>
              </div>

              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
                <p style="font-size: 16px; margin: 0 0 20px 0;">Hello ${adminName},</p>

                <p style="font-size: 15px; margin: 0 0 20px 0;">
                  A work order has been marked as <strong style="color: #059669;">completed</strong> by the assigned subcontractor.
                </p>

                <div style="background: white; padding: 20px; border-radius: 8px; margin: 0 0 20px 0; border-left: 4px solid #10b981;">
                  <div style="margin-bottom: 12px;">
                    <span style="background: #d1fae5; color: #065f46; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Completed</span>
                    <span style="background: ${priorityColor}22; color: ${priorityColor}; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 6px;">${priorityLabel} Priority</span>
                  </div>

                  <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #111827;">${title}</h2>

                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 130px;">Work Order #</td>
                      <td style="padding: 6px 0; font-size: 14px; font-weight: 600;">${workOrderNumber}</td>
                    </tr>
                    ${clientName ? `<tr>
                      <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Client</td>
                      <td style="padding: 6px 0; font-size: 14px;">${clientName}</td>
                    </tr>` : ''}
                    ${locationName ? `<tr>
                      <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Location</td>
                      <td style="padding: 6px 0; font-size: 14px;">${locationName}</td>
                    </tr>` : ''}
                    ${completedBy ? `<tr>
                      <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Completed By</td>
                      <td style="padding: 6px 0; font-size: 14px;">${completedBy}</td>
                    </tr>` : ''}
                  </table>

                  ${completionDetails ? `
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Completion Notes</p>
                      <p style="margin: 0; font-size: 14px; color: #374151;">${completionDetails}</p>
                    </div>
                  ` : ''}
                </div>

                <p style="font-size: 15px; margin: 0 0 20px 0;">
                  You can now review the work order and generate an invoice if required.
                </p>

                <div style="text-align: center; margin: 24px 0;">
                  <a href="${portalLink}"
                     style="background: linear-gradient(135deg, #065f46 0%, #10b981 100%);
                            color: white;
                            padding: 14px 36px;
                            text-decoration: none;
                            border-radius: 8px;
                            font-size: 15px;
                            font-weight: bold;
                            display: inline-block;">
                    View Work Order
                  </a>
                </div>

                <p style="font-size: 13px; color: #9ca3af; margin: 24px 0 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  You are receiving this email because you have work order notifications enabled. You can manage this in the Admin Users settings.
                </p>
              </div>

              <div style="text-align: center; margin-top: 16px; color: #9ca3af; font-size: 12px;">
                <p>© ${new Date().getFullYear()} GroundOps LLC. All rights reserved.</p>
              </div>
            </body>
          </html>
        `;

        try {
          await sendEmail({
            to: admin.email,
            subject: `✅ Work Order Completed: ${workOrderNumber} — ${title}`,
            html: emailHtml,
          });
        } catch (err: any) {
          console.error(`Failed to send completion email to ${admin.email}:`, err.message);
          errors.push(admin.email);
        }
      })
    );

    return NextResponse.json({
      success: true,
      sent: eligibleAdmins.length - errors.length,
      failed: errors.length,
    });
  } catch (error: any) {
    console.error('Error sending work order completion notification emails:', error);
    return NextResponse.json(
      { error: 'Failed to send completion notification emails', details: error.message },
      { status: 500 }
    );
  }
}
