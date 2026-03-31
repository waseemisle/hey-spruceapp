const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const fromEmail = process.env.FROM_EMAIL || 'info@groundops.co';

  if (!apiKey) {
    throw new Error('MAILGUN_API_KEY is not configured.');
  }
  if (!domain) {
    throw new Error('MAILGUN_DOMAIN is not configured.');
  }

  const recipients = Array.isArray(to) ? to : [to];

  // Use EU endpoint if MAILGUN_EU=true, otherwise US
  const baseUrl = process.env.MAILGUN_EU === 'true'
    ? `https://api.eu.mailgun.net/v3/${domain}/messages`
    : `https://api.mailgun.net/v3/${domain}/messages`;

  const authHeader = 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64');

  const MAX_RETRIES = 4;
  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 600 * Math.pow(2, attempt - 1);
        console.log(`📧 Retry attempt ${attempt}/${MAX_RETRIES - 1} after ${delay}ms...`);
        await sleep(delay);
      } else {
        console.log('📧 Sending email via Mailgun...');
        console.log('📧 To:', recipients.join(', '));
        console.log('📧 Subject:', subject);
      }

      const formData = new FormData();
      formData.append('from', `GroundOps <${fromEmail}>`);
      recipients.forEach((r) => formData.append('to', r));
      formData.append('subject', subject);
      formData.append('html', html);

      for (const att of attachments) {
        const buffer = Buffer.from(att.content, 'base64');
        const blob = new Blob([buffer], { type: att.type || 'application/octet-stream' });
        formData.append('attachment', blob, att.filename);
      }

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }));
        const isRateLimit = response.status === 429;

        if (isRateLimit && attempt < MAX_RETRIES - 1) {
          console.warn(`⚠️ Mailgun rate limit hit (attempt ${attempt + 1}), will retry...`);
          lastError = new Error(errorBody.message || 'Rate limit');
          continue;
        }

        throw new Error(`Mailgun error ${response.status}: ${errorBody.message || response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Email sent successfully via Mailgun. ID:', data?.id);
      return { success: true, id: data?.id };
    } catch (err: any) {
      const isRateLimit = err?.message?.toLowerCase().includes('rate limit') || err?.status === 429;

      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        console.warn(`⚠️ Mailgun rate limit hit (attempt ${attempt + 1}), will retry...`);
        lastError = err;
        continue;
      }

      console.error('❌ Mailgun Error:', err);
      throw new Error(`Failed to send email: ${err?.message || String(err)}`);
    }
  }

  throw new Error(`Failed to send email after ${MAX_RETRIES} attempts: ${lastError?.message || String(lastError)}`);
}
