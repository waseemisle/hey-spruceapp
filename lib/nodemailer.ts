// Send email using Nodemailer
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
  }>;
}) {
  // Dynamic require to avoid webpack issues
  const nodemailerModule = require('nodemailer');
  const nodemailer = nodemailerModule.default || nodemailerModule;

  const fromEmail = process.env.SMTP_FROM_EMAIL || 'matthew@heyspruce.com';

  // Check if SMTP credentials are available
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // Test mode - no SMTP configured
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('\n========================================');
    console.log('📧 EMAIL (TEST MODE)');
    console.log('========================================');
    console.log('From:', fromEmail);
    console.log('To:', Array.isArray(to) ? to.join(', ') : to);
    console.log('Subject:', subject);
    console.log('Attachments:', attachments.length);
    console.log('⚠️  SMTP not configured - Add SMTP_* environment variables');
    console.log('========================================\n');
    return {
      success: true,
      testMode: true,
      messageId: 'test-mode',
    };
  }

  // Create transporter (note: it's createTransport, not createTransporter!)
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  // Convert base64 attachments to Buffer
  const processedAttachments = attachments.map((att) => ({
    filename: att.filename,
    content: Buffer.from(att.content, 'base64'),
  }));

  // Send email
  const info = await transporter.sendMail({
    from: `Hey Spruce <${fromEmail}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
  });

  return {
    success: true,
    messageId: info.messageId,
  };
}
