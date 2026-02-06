import FormData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(FormData);

const apiKey = process.env.MAILGUN_API_KEY;
const domain = process.env.MAILGUN_DOMAIN;

// Initialize Mailgun client lazily based on API key
const mg = apiKey
  ? mailgun.client({
      username: 'api',
      key: apiKey,
      url: process.env.MAILGUN_API_URL || 'https://api.mailgun.net',
    })
  : null;

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
  // Configuration
  const fromEmail = process.env.MAILGUN_FROM_EMAIL;

  // Validate Mailgun configuration
  if (!apiKey) {
    const errorMessage =
      'Mailgun API key is not configured. Please set MAILGUN_API_KEY environment variable.';
    console.error('❌ MAILGUN_API_KEY not configured');
    console.error(
      '📧 Email would have been sent to:',
      Array.isArray(to) ? to.join(', ') : to,
    );
    console.error('📧 Subject:', subject);
    throw new Error(errorMessage);
  }

  if (!domain) {
    const errorMessage =
      'Mailgun domain is not configured. Please set MAILGUN_DOMAIN environment variable.';
    console.error('❌ MAILGUN_DOMAIN not configured');
    throw new Error(errorMessage);
  }

  if (!fromEmail) {
    const errorMessage =
      'MAILGUN_FROM_EMAIL is not configured. Please set it in your environment variables.';
    console.error('❌ MAILGUN_FROM_EMAIL not configured');
    throw new Error(errorMessage);
  }

  if (!mg) {
    throw new Error('Mailgun client is not initialized.');
  }

  const recipients = Array.isArray(to) ? to : [to];

  const messageData: any = {
    from: fromEmail,
    to: recipients,
    subject,
    html,
  };

  // Add attachments if provided
  if (attachments.length > 0) {
    messageData.attachment = attachments.map((att) => ({
      filename: att.filename,
      data: Buffer.from(att.content, 'base64'),
      contentType: att.type || 'application/pdf',
    }));
  }

  try {
    console.log('📧 Attempting to send email via Mailgun...');
    console.log('📧 To:', recipients.join(', '));
    console.log('📧 From:', fromEmail);
    console.log('📧 Subject:', subject);

    const response: any = await mg.messages.create(domain, messageData);

    console.log('✅ Email sent successfully via Mailgun');
    if (response && (response.id || response.message)) {
      console.log('📧 Mailgun response:', response.id || response.message);
    }

    return {
      success: true,
      id: response?.id || response?.message,
    };
  } catch (error: any) {
    console.error('❌ Mailgun API Error:', error);

    // Mailgun errors may include status and details fields
    const statusCode = error?.status;
    const details = error?.details || error?.message || String(error);

    if (statusCode) {
      throw new Error(
        `Mailgun API Error (${statusCode}): ${
          typeof details === 'string' ? details : JSON.stringify(details, null, 2)
        }`,
      );
    }

    throw new Error(`Failed to send email: ${details}`);
  }
}

