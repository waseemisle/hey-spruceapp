import sgMail from '@sendgrid/mail';

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
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
  attachments?: Array<{
    filename: string;
    content: string; // base64 content
    type?: string;
    disposition?: string;
  }>;
}) {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'matthew@heyspruce.com';

  if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY not configured');
    throw new Error('SendGrid API key not configured');
  }

  const msg: any = {
    to: Array.isArray(to) ? to : [to],
    from: fromEmail,
    subject,
    html,
  };

  // Add attachments if provided
  if (attachments.length > 0) {
    msg.attachments = attachments.map((att) => ({
      content: att.content,
      filename: att.filename,
      type: att.type || 'application/pdf',
      disposition: att.disposition || 'attachment',
    }));
  }

  const response = await sgMail.send(msg);

  return {
    success: true,
    messageId: response[0].headers['x-message-id'],
  };
}
