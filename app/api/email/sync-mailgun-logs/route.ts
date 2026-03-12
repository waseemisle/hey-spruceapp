import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import { EmailType } from '@/lib/email-logger';

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

function detectEmailType(subject: string): EmailType {
  const s = subject.toLowerCase();
  if (s.includes('invoice') && s.includes('payment due')) return 'invoice';
  if (s.includes('invoice #')) return 'invoice';
  if (s.includes('new bidding opportunity')) return 'bidding-opportunity';
  if (s.includes('bidding opportunity')) return 'bidding-opportunity';
  if (s.includes('work order assignment')) return 'assignment';
  if (s.includes('subcontractor account has been approved')) return 'subcontractor-approval';
  if (s.includes('account has been approved')) return 'client-approval';
  if (s.includes('set up your') && s.includes('account')) return 'invitation';
  if (s.includes('welcome to groundops')) return 'invitation';
  if (s.includes('maintenance request')) return 'maint-request-notification';
  if (s.includes('has been scheduled')) return 'scheduled-service';
  if (s.includes('new quote received')) return 'quote-notification';
  if (s.includes('how was your service')) return 'review-request';
  if (s.includes('rate your service')) return 'review-request';
  if (s.includes('work order completed')) return 'work-order-completed-notification';
  if (s.includes('new work order')) return 'work-order-notification';
  if (s.includes('quote #')) return 'quote';
  if (s.includes('test email')) return 'test';
  return 'test';
}

function sanitizeDocId(id: string): string {
  // Firestore doc IDs can't contain / and must be < 1500 bytes
  return id.replace(/[/]/g, '_').substring(0, 100);
}

async function fetchMailgunEvents(apiKey: string, domain: string, apiUrl: string, pageUrl?: string) {
  const baseUrl = apiUrl.replace(/\/$/, '');
  const url = pageUrl || `${baseUrl}/v3/${domain}/events?event=accepted&limit=300`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mailgun API error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function POST() {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const apiUrl = process.env.MAILGUN_API_URL || 'https://api.mailgun.net';

  if (!apiKey || !domain) {
    return NextResponse.json(
      { error: 'MAILGUN_API_KEY and MAILGUN_DOMAIN must be configured' },
      { status: 500 },
    );
  }

  try {
    const app = getFirebaseApp();
    const db = getFirestore(app);

    let imported = 0;
    let skipped = 0;
    let nextPageUrl: string | null = null;
    let pagesFetched = 0;
    const maxPages = 10; // Fetch up to 3000 events (300 per page × 10 pages)

    do {
      const data: any = await fetchMailgunEvents(
        apiKey,
        domain,
        apiUrl,
        nextPageUrl || undefined,
      );

      const items: any[] = data.items || [];

      for (const item of items) {
        const recipient: string =
          item.recipient ||
          item.message?.headers?.to ||
          item.envelope?.recipients?.[0] ||
          '';

        const subject: string = item.message?.headers?.subject || '(no subject)';
        const mailgunId: string = item.id || item['event-data']?.id || '';
        const timestampSeconds: number = item.timestamp || 0;

        if (!recipient || !mailgunId) continue;

        const docId = sanitizeDocId(mailgunId);
        const emailType = detectEmailType(subject);

        const logEntry = {
          type: emailType,
          to: recipient,
          subject,
          status: item.event === 'failed' || item.event === 'rejected' ? 'failed' : 'sent',
          context: {
            mailgunEvent: item.event,
            from: item.envelope?.sender || item.message?.headers?.from || '',
          },
          sentAt: Timestamp.fromMillis(timestampSeconds * 1000),
          mailgunId,
          source: 'mailgun-import',
        };

        // setDoc with the Mailgun event ID as document ID — idempotent, safe to run repeatedly
        await setDoc(doc(db, 'emailLogs', docId), logEntry, { merge: true });
        imported++;
      }

      // Follow pagination
      nextPageUrl = data.paging?.next || null;
      pagesFetched++;

      // Stop if no more pages or the next page URL is the same (Mailgun returns same URL when exhausted)
      if (nextPageUrl && items.length === 0) {
        nextPageUrl = null;
      }
    } while (nextPageUrl && pagesFetched < maxPages);

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      pagesFetched,
      message: `Synced ${imported} emails from Mailgun`,
    });
  } catch (error: any) {
    console.error('Mailgun sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync Mailgun logs' },
      { status: 500 },
    );
  }
}
