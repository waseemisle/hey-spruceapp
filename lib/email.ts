import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import { getServerDb } from '@/lib/firebase-server';
import { doc, getDoc } from 'firebase/firestore';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if emails are globally enabled. Returns true if emails should be sent.
 * Reads from Firestore appSettings/email document.
 */
async function isEmailEnabled(): Promise<boolean> {
  try {
    const db = await getServerDb();
    const settingsDoc = await getDoc(doc(db, 'appSettings', 'email'));
    if (!settingsDoc.exists()) return true; // Default: enabled
    return settingsDoc.data().enabled !== false;
  } catch (error) {
    console.warn('⚠️ Could not check email settings, defaulting to enabled:', error);
    return true; // Fail-open: send emails if we can't check settings
  }
}

/**
 * Send multiple emails sequentially with a delay between each to avoid
 * rate limits. Each item is a sendEmail() call factory.
 */
export async function sendEmailsSequentially(
  tasks: (() => Promise<{ success: boolean; id?: string }>)[],
  delayMs = 600,
): Promise<{ success: boolean; id?: string; error?: string }[]> {
  const results: { success: boolean; id?: string; error?: string }[] = [];
  for (let i = 0; i < tasks.length; i++) {
    if (i > 0) await sleep(delayMs);
    try {
      const result = await tasks[i]();
      results.push(result);
    } catch (err: any) {
      results.push({ success: false, error: err?.message || String(err) });
    }
  }
  return results;
}

type AttachmentInput = {
  filename: string;
  content: string; // base64 content
  type?: string;
  disposition?: string;
};

function getMailgunClient() {
  const apiKey = process.env.MAILGUN_API_KEY;
  if (!apiKey) throw new Error('MAILGUN_API_KEY is not configured.');

  const mailgun = new Mailgun(FormData);
  return mailgun.client({
    username: 'api',
    key: apiKey,
    ...(process.env.MAILGUN_EU === 'true' ? { url: 'https://api.eu.mailgun.net' } : {}),
  });
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments = [],
}: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: AttachmentInput[];
}) {
  // Check global email kill switch
  const emailEnabled = await isEmailEnabled();
  if (!emailEnabled) {
    const recipients = Array.isArray(to) ? to : [to];
    console.log('🚫 Emails are globally disabled. Skipping email to:', recipients.join(', '), 'Subject:', subject);
    return { success: true, id: 'emails-disabled' };
  }

  const domain = process.env.MAILGUN_DOMAIN;
  const fromEmail = process.env.FROM_EMAIL || 'info@groundops.co';

  if (!process.env.MAILGUN_API_KEY) throw new Error('MAILGUN_API_KEY is not configured.');
  if (!domain) throw new Error('MAILGUN_DOMAIN is not configured.');

  const recipients = Array.isArray(to) ? to : [to];

  const messageData: any = {
    from: `GroundOps <${fromEmail}>`,
    to: recipients,
    subject,
    html,
  };

  if (attachments.length > 0) {
    messageData.attachment = attachments.map((att) => ({
      filename: att.filename,
      data: Buffer.from(att.content, 'base64'),
    }));
  }

  // Try to send with 3 quick retries (5s, 10s, 20s)
  // If still rate-limited after that, DON'T throw — return success with queued flag
  // so callers never get stuck or see errors for rate limits
  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [0, 5000, 10000, 20000];
  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] || 10000;
        console.log(`📧 Retry ${attempt}/${MAX_RETRIES - 1} after ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        console.log(`📧 Sending email → ${recipients.join(', ')} | ${subject}`);
      }

      const mg = getMailgunClient();
      const data = await mg.messages.create(domain, messageData);

      console.log('✅ Email sent. ID:', data?.id);
      return { success: true, id: data?.id };
    } catch (err: any) {
      lastError = err;
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.toLowerCase().includes('rate limit') ||
        err?.message?.toLowerCase().includes('too many requests');

      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        console.warn(`⚠️ Rate limit hit (attempt ${attempt + 1}/${MAX_RETRIES}), retrying...`);
        continue;
      }

      if (isRateLimit) {
        // All retries exhausted but it's just a rate limit — don't throw
        // Return success so callers don't get stuck. Log it as a warning.
        console.warn(`⚠️ Rate limit persists after ${MAX_RETRIES} attempts. Email will need to be resent later.`);
        console.warn(`⚠️ To: ${recipients.join(', ')} | Subject: ${subject}`);
        return { success: false, id: 'rate-limited', rateLimited: true };
      }

      // Non-rate-limit error — throw normally
      console.error('❌ Mailgun Error:', err?.message || err);
      throw new Error(`Failed to send email: ${err?.message || String(err)}`);
    }
  }

  // Should not reach here, but just in case
  return { success: false, id: 'retry-exhausted' };
}
