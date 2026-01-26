import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/sendgrid';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      toEmail,
      toName,
      workOrderNumber,
    } = body;

    // Logo URL from HeySpruce
    const logoUrl = 'https://cdn.prod.website-files.com/67edc7c78e3151d3b06686b2/681007b1b7f5a5cc527f1b94_Hey_SPRUCE_logo_font.png';
    
    // Google Maps Review Link
    const googleReviewLink = 'https://www.google.com/maps/place/Spruce+Cleaning+%26+Maintenance/@34.0204789,-118.4117326,10z/data=!3m1!4b1!4m6!3m5!1s0x20a5e683df0722d:0x409439675ca2c8b!8m2!3d34.020479!4d-118.4117326!16s%2Fg%2F11xw24xtqb?entry=ttu&g_ep=EgoyMDI1MTExNy4wIKXMDSoASAFQAw%3D%3D';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rate Your Service - HeySpruce</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #ffffff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
          <!-- Logo Section -->
          <div style="text-align: center; margin-bottom: 40px;">
            <img src="${logoUrl}" alt="HeySpruce Logo" style="max-width: 200px; height: auto; margin: 0 auto; display: block;" />
          </div>

          <!-- Main Heading -->
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="font-size: 28px; font-weight: bold; color: #000000; margin: 0 0 10px 0; line-height: 1.3;">
              Please rate your service with<br>HeySpruce
            </h1>
          </div>

          <!-- Star Rating Section -->
          <div style="text-align: center; margin-bottom: 50px;">
            <div style="margin-bottom: 20px;">
              <a href="${googleReviewLink}" style="text-decoration: none; display: inline-block;">
                <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 15px;">
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer; transition: color 0.2s;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer; transition: color 0.2s;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer; transition: color 0.2s;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer; transition: color 0.2s;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer; transition: color 0.2s;">★</span>
                </div>
              </a>
              <div style="display: flex; justify-content: space-between; max-width: 400px; margin: 0 auto; padding: 0 20px;">
                <span style="font-size: 14px; color: #000000;">Poor</span>
                <span style="font-size: 14px; color: #000000;">Excellent</span>
              </div>
            </div>
            
            <!-- Call to Action Button -->
            <div style="margin-top: 30px;">
              <a href="${googleReviewLink}" 
                 style="background-color: #4285f4; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">
                Leave a Review on Google
              </a>
            </div>
          </div>

          <!-- Company Information Section -->
          <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
            <div style="text-align: center; color: #000000; font-size: 14px; line-height: 2;">
              <p style="margin: 5px 0;">
                <strong>Phone:</strong> 
                <a href="tel:1-877-253-26464" style="color: #4285f4; text-decoration: none;">1-877-253-26464</a>
              </p>
              <p style="margin: 5px 0;">
                <strong>Email:</strong> 
                <a href="mailto:info@heyspruce.com" style="color: #4285f4; text-decoration: none;">info@heyspruce.com</a>
              </p>
              <p style="margin: 5px 0;">
                <strong>Website:</strong> 
                <a href="https://www.heyspruce.com/" style="color: #4285f4; text-decoration: none; word-break: break-all;">https://www.heyspruce.com/</a>
              </p>
              <p style="margin: 5px 0;">
                <strong>Address:</strong><br>
                1972 E 20th St, Los Angeles, CA 90058
              </p>
            </div>
          </div>

          <!-- Footer Links -->
          <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
            <div style="font-size: 12px; color: #4285f4;">
              <a href="#" style="color: #4285f4; text-decoration: none; margin: 0 10px;">HeySpruce Terms & Conditions</a> |
              <a href="#" style="color: #4285f4; text-decoration: none; margin: 0 10px;">Privacy Policy</a> |
              <a href="#" style="color: #4285f4; text-decoration: none; margin: 0 10px;">CA Privacy Notice</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: toEmail,
      subject: `How was your service with HeySpruce? - Work Order ${workOrderNumber}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error sending review request email:', error);
    console.error('❌ Error details:', error.message || error);
    
    const errorMessage = error.message || String(error);
    const isConfigError = errorMessage.includes('not configured') || errorMessage.includes('SENDGRID');
    
    return NextResponse.json(
      {
        error: 'Failed to send review request email',
        details: errorMessage,
        configError: isConfigError,
        suggestion: isConfigError ? 'Please configure SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables. See SENDGRID_SETUP.md for instructions.' : undefined
      },
      { status: 500 }
    );
  }
}



