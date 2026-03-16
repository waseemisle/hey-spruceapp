import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send multiple emails sequentially with a delay between each to avoid
 * Resend's 2 req/s rate limit. Each item is a sendEmail() call factory.
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
  const fromEmail = process.env.FROM_EMAIL || 'info@groundops.co';

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const recipients = Array.isArray(to) ? to : [to];

  const messageData: any = {
    from: `GroundOps <${fromEmail}>`,
    to: recipients,
    subject,
    html,
  };

  if (attachments.length > 0) {
    messageData.attachments = attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
    }));
  }

  const MAX_RETRIES = 4;
  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 600ms, 1200ms, 2400ms
        const delay = 600 * Math.pow(2, attempt - 1);
        console.log(`📧 Retry attempt ${attempt}/${MAX_RETRIES - 1} after ${delay}ms...`);
        await sleep(delay);
      } else {
        console.log('📧 Sending email via Resend...');
        console.log('📧 To:', recipients.join(', '));
        console.log('📧 Subject:', subject);
      }

      const { data, error } = await resend.emails.send(messageData);

      if (error) {
        const isRateLimit =
          error.message?.toLowerCase().includes('too many requests') ||
          error.message?.toLowerCase().includes('rate limit') ||
          (error as any).statusCode === 429;

        if (isRateLimit && attempt < MAX_RETRIES - 1) {
          console.warn(`⚠️ Resend rate limit hit (attempt ${attempt + 1}), will retry...`);
          lastError = error;
          continue;
        }
        throw new Error(`Resend error: ${error.message}`);
      }

      console.log('✅ Email sent successfully via Resend. ID:', data?.id);
      return { success: true, id: data?.id };
    } catch (err: any) {
      const isRateLimit =
        err?.message?.toLowerCase().includes('too many requests') ||
        err?.message?.toLowerCase().includes('rate limit') ||
        err?.statusCode === 429;

      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        console.warn(`⚠️ Resend rate limit hit (attempt ${attempt + 1}), will retry...`);
        lastError = err;
        continue;
      }

      console.error('❌ Resend Error:', err);
      throw new Error(`Failed to send email: ${err?.message || String(err)}`);
    }
  }

  throw new Error(`Failed to send email after ${MAX_RETRIES} attempts: ${lastError?.message || String(lastError)}`);
}
