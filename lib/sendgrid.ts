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

  // Check if API key is configured
  if (!apiKey) {
    const errorMessage = 'SendGrid API key is not configured. Please set SENDGRID_API_KEY environment variable. See SENDGRID_SETUP.md for instructions.';
    console.error('❌ SENDGRID_API_KEY not configured');
    console.error('📧 Email would have been sent to:', Array.isArray(to) ? to.join(', ') : to);
    console.error('📧 Subject:', subject);
    throw new Error(errorMessage);
  }

  // Validate from email
  if (!fromEmail) {
    const errorMessage = 'SENDGRID_FROM_EMAIL is not configured. Please set it in your environment variables.';
    console.error('❌ SENDGRID_FROM_EMAIL not configured');
    throw new Error(errorMessage);
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

  try {
    console.log('📧 Attempting to send email via SendGrid...');
    console.log('📧 To:', Array.isArray(to) ? to.join(', ') : to);
    console.log('📧 From:', fromEmail);
    console.log('📧 Subject:', subject);
    
    const response = await sgMail.send(msg);
    
    console.log('✅ Email sent successfully via SendGrid');
    console.log('📧 Message ID:', response[0].headers['x-message-id']);

    return {
      success: true,
      messageId: response[0].headers['x-message-id'],
    };
  } catch (error: any) {
    // Handle SendGrid API errors
    console.error('❌ SendGrid API Error:', error);
    
    if (error.response) {
      const { statusCode, body } = error.response;
      console.error('❌ Status Code:', statusCode);
      console.error('❌ Error Body:', JSON.stringify(body, null, 2));
      
      // Extract error message from SendGrid response
      const errorMessages = body?.errors?.map((err: any) => err.message).join(', ') || body?.message || 'Unknown SendGrid error';
      throw new Error(`SendGrid API Error (${statusCode}): ${errorMessages}`);
    }
    
    // Handle other errors
    throw new Error(`Failed to send email: ${error.message || String(error)}`);
  }
}
