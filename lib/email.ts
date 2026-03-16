import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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

  try {
    console.log('📧 Sending email via Resend...');
    console.log('📧 To:', recipients.join(', '));
    console.log('📧 From:', fromEmail);
    console.log('📧 Subject:', subject);

    const { data, error } = await resend.emails.send(messageData);

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }

    console.log('✅ Email sent successfully via Resend');
    console.log('📧 Resend ID:', data?.id);

    return { success: true, id: data?.id };
  } catch (error: any) {
    console.error('❌ Resend Error:', error);
    throw new Error(`Failed to send email: ${error?.message || String(error)}`);
  }
}
