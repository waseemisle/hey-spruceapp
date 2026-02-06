import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailgun';
import { formatAddress } from '@/lib/utils';

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

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your job with Hey Spruce has been scheduled</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header with Logo -->
          <div style="text-align: center; padding: 30px 20px 20px 20px; background-color: white;">
            <div style="margin-bottom: 20px;">
              <div style="width: 100px; height: 100px; margin: 0 auto; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: 4px solid #1a1a1a; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <span style="color: white; font-size: 42px; font-weight: bold;">HS</span>
              </div>
            </div>
            <h1 style="color: #1a1a1a; margin: 0; font-size: 26px; font-weight: bold; line-height: 1.3;">Your job with Hey Spruce has been scheduled</h1>
          </div>

          <!-- Content -->
          <div style="padding: 30px; background-color: white;">
            <!-- When Section -->
            <div style="margin-bottom: 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">When:</h2>
              <p style="color: #333; margin: 0; font-size: 16px; line-height: 1.5;">${formattedDate} arriving between ${timeRange}</p>
            </div>

            <!-- Address Section -->
            <div style="margin-bottom: 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">Address:</h2>
              <p style="color: #333; margin: 0 0 15px 0; font-size: 16px; line-height: 1.5;">${locationName ? `${locationName}<br>` : ''}${formattedAddress}</p>
              
              <!-- Google Maps Link/Image -->
              <div style="margin-top: 15px;">
                <a href="${googleMapsLinkUrl}" target="_blank" style="display: block; text-decoration: none; border-radius: 8px; overflow: hidden; border: 1px solid #d1d5db;">
                  ${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 
                    ? `<img 
                        src="https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddress}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${encodedAddress}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}" 
                        alt="Location Map" 
                        style="width: 100%; height: 300px; object-fit: cover; display: block;"
                      />`
                    : `<div style="width: 100%; height: 300px; background-color: #e5e7eb; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #4b5563;">
                         <div style="font-size: 48px; margin-bottom: 10px;">📍</div>
                         <p style="margin: 0; font-size: 14px; font-weight: 500; color: #10b981;">Click to view on Google Maps</p>
                       </div>`
                  }
                </a>
              </div>
              <p style="font-size: 11px; color: #6b7280; margin: 10px 0 0 0; text-align: right;">
                Map data ©${new Date().getFullYear()} Google
              </p>
            </div>

            <!-- Services Section -->
            <div style="margin-bottom: 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">Services:</h2>
              <p style="color: #333; margin: 0 0 15px 0; font-size: 16px; line-height: 1.5;"><strong>${workOrderNumber}</strong> ${workOrderTitle}</p>
              
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;">
                <strong>3.9% card payment fee</strong>
              </p>
              
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                If you pay by credit or debit card, a 3.9% processing fee will be added to the total amount. To avoid this fee, you can choose to pay with cash, Zelle, check, or ACH transfer.
              </p>
              
              <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                We offer financing through our partner company, Wisetack. You can learn more <a href="https://www.wisetack.com" target="_blank" style="color: #10b981; text-decoration: underline;">here</a>.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <div style="margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #4b5563;">
                <a href="tel:1-877-253-26464" style="color: #10b981; text-decoration: none; margin-right: 10px;">1-877-253-26464</a> | 
                <a href="mailto:info@heyspruce.com" style="color: #10b981; text-decoration: none; margin: 0 10px;">info@heyspruce.com</a>
              </p>
              <p style="margin: 10px 0; font-size: 14px; color: #4b5563;">
                <a href="https://www.heyspruce.com/" target="_blank" style="color: #10b981; text-decoration: none;">https://www.heyspruce.com/</a>
              </p>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #4b5563;">
                1972 E 20th St, Los Angeles, CA 90058
              </p>
            </div>
            <p style="margin: 20px 0 0 0; font-size: 12px; color: #6b7280;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.heyspruce.com'}/terms" target="_blank" style="color: #6b7280; text-decoration: underline;">Terms & Conditions</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: toEmail,
      subject: `Your job with Hey Spruce has been scheduled - ${workOrderNumber}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending scheduled service email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('MAILGUN');
    
    return NextResponse.json(
      {
        error: 'Failed to send scheduled service email',
        details: errorMessage,
        configError: isConfigError,
        suggestion: isConfigError
          ? 'Please configure MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL environment variables.'
          : undefined
      },
      { status: 500 }
    );
  }
}

