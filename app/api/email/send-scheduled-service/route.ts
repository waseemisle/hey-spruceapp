import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { formatAddress } from '@/lib/utils';
import { logEmail } from '@/lib/email-logger';
import { emailLayout, infoCard, infoRow, ctaButton, alertBox } from '@/lib/email-template';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      toEmail,
      toName,
      workOrderNumber,
      workOrderTitle,
      scheduledDate,
      scheduledTimeStart,
      scheduledTimeEnd,
      locationName,
      locationAddress
    } = body;

    // Format the address string
    const formattedAddress = formatAddress(locationAddress);

    // Format the date in a readable format (e.g., "Sunday November 16, 2025")
    const dateObj = new Date(scheduledDate);
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Format time range (e.g., "11:00am - 1:00pm")
    const formatTime = (time: string) => {
      if (!time) return '';
      // Handle both "HH:mm" and "HH:mm AM/PM" formats
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'pm' : 'am';
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      return `${displayHour}:${minutes || '00'}${ampm}`;
    };

    const timeRange = scheduledTimeEnd
      ? `${formatTime(scheduledTimeStart)} - ${formatTime(scheduledTimeEnd)}`
      : formatTime(scheduledTimeStart);

    // Create Google Maps embed URL from address
    // Encode the address for Google Maps
    const encodedAddress = encodeURIComponent(formattedAddress);
    const googleMapsLinkUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    // Create Google Maps embed iframe URL
    // Using the static Google Maps embed (works without API key)
    const mapEmbedUrl = `https://www.google.com/maps?q=${encodedAddress}&output=embed`;

    const emailHtml = emailLayout({
      title: 'Your Service Has Been Scheduled',
      preheader: `Your GroundOps job is confirmed for ${formattedDate}`,
      body: `
        <p style="margin:0 0 20px 0;">Hi <strong>${toName}</strong>,</p>
        <p style="margin:0 0 20px 0;color:#5A6C7A;">Your service has been scheduled. Here are the details:</p>
        ${infoCard(`
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#1A2635;">${workOrderTitle}</p>
          ${infoRow('Work Order #', workOrderNumber)}
          ${infoRow('Date', formattedDate)}
          ${timeRange ? infoRow('Time', timeRange) : ''}
          ${locationName ? infoRow('Location', locationName) : ''}
          ${formattedAddress ? infoRow('Address', formattedAddress) : ''}
        `)}
        ${formattedAddress ? `
          <div style="margin:20px 0;">
            <a href="${googleMapsLinkUrl}" target="_blank" style="display:block;text-decoration:none;border-radius:6px;overflow:hidden;border:1px solid #E2E8F0;">
              <div style="width:100%;height:180px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-direction:column;">
                <div style="font-size:36px;margin-bottom:8px;">📍</div>
                <p style="margin:0;font-size:14px;font-weight:600;color:#2563EB;">View on Google Maps</p>
                <p style="margin:4px 0 0 0;font-size:12px;color:#5A6C7A;">${formattedAddress}</p>
              </div>
            </a>
          </div>
        ` : ''}
        ${alertBox('A 3.9% processing fee applies for card payments. Avoid the fee by paying with cash, Zelle, check, or ACH transfer.', 'info')}
      `,
    });

    await sendEmail({
      to: toEmail,
      subject: `Your job with GroundOps has been scheduled - ${workOrderNumber}`,
      html: emailHtml,
    });
    await logEmail({ type: 'scheduled-service', to: toEmail, subject: `Your job with GroundOps has been scheduled - ${workOrderNumber}`, status: 'sent', context: { toName, workOrderNumber, workOrderTitle, scheduledDate, scheduledTimeStart, scheduledTimeEnd, locationName, locationAddress } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending scheduled service email:', error);
    console.error('❌ Error details:', error.message || error);

    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('RESEND');

    return NextResponse.json(
      {
        error: 'Failed to send scheduled service email',
        details: errorMessage,
        configError: isConfigError,
        suggestion: isConfigError
          ? 'Please configure RESEND_API_KEY and FROM_EMAIL environment variables.'
          : undefined
      },
      { status: 500 }
    );
  }
}
