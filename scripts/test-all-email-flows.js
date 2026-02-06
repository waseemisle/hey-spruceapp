// Comprehensive test script to send all email flows with real data
// Usage: node scripts/test-all-email-flows.js

const FormData = require("form-data");
const Mailgun = require("mailgun.js");
const fs = require("fs");
const path = require("path");

// Mailgun Configuration
const API_KEY = process.env.MAILGUN_API_KEY;
const DOMAIN = process.env.MAILGUN_DOMAIN || "heyspruce.com";
const FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || "matthew@heyspruce.com";
const TO_EMAIL = process.env.TEST_EMAIL_TO || "waseemisle@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hey-spruce-appv2.vercel.app";

if (!API_KEY) {
  console.error("❌ Error: MAILGUN_API_KEY environment variable is required");
  process.exit(1);
}

// Initialize Mailgun
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: API_KEY,
});

// Helper function to create a simple PDF base64
function createSamplePDFBase64(content = "Sample PDF Document") {
  // This is a minimal PDF in base64 format
  // In production, you'd use jsPDF or similar
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(${content}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000306 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
390
%%EOF`;
  
  return Buffer.from(pdfContent).toString('base64');
}

// Helper function to send email
async function sendEmail(subject, html, attachments = []) {
  try {
    const messageData = {
      from: `Matthew <${FROM_EMAIL}>`,
      to: [TO_EMAIL],
      subject,
      html,
    };

    if (attachments.length > 0) {
      messageData.attachment = attachments.map(att => ({
        filename: att.filename,
        data: Buffer.from(att.content, 'base64'),
        contentType: att.type || 'application/pdf',
      }));
    }

    const data = await mg.messages.create(DOMAIN, messageData);
    console.log(`✅ ${subject}`);
    console.log(`   Message ID: ${data.id || data.message}`);
    return { success: true, id: data.id || data.message };
  } catch (error) {
    console.error(`❌ Failed to send: ${subject}`);
    console.error(`   Error: ${error.message || error}`);
    return { success: false, error: error.message || error };
  }
}

// 1. Maintenance Request Notification
async function sendMaintenanceRequestNotification() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Maintenance Request</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #ef4444dd 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">New Maintenance Request</h1>
          <p style="color: white; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Priority: High</p>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello Admin,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">A new maintenance request has been received via the API and requires your attention.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #ef4444;">HVAC System Not Working</h2>
            <p style="margin: 0 0 10px 0;"><strong>Venue:</strong> Downtown Restaurant</p>
            <p style="margin: 0 0 10px 0;"><strong>Requestor:</strong> John Manager</p>
            <p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: #ef4444; font-weight: bold;">High</span></p>
            <p style="margin: 0 0 10px 0;"><strong>Date/Time:</strong> ${new Date().toLocaleString()}</p>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 5px 0;"><strong>Description:</strong></p>
              <p style="margin: 0; color: #4b5563;">The HVAC system in the main dining area is not cooling properly. Temperature is rising and customers are complaining.</p>
            </div>
          </div>
          <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>⚠️ URGENT:</strong> This request requires immediate attention!</p>
          </div>
          <p style="font-size: 16px; margin: 20px 0;">A work order has been automatically created for this maintenance request. Please review and approve it in the Admin Portal:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/admin-portal/work-orders" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">Review Work Order</a>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("🚨 URGENT: New Maintenance Request: HVAC System Not Working", html);
}

// 2. Scheduled Service
async function sendScheduledService() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your job with Hey Spruce has been scheduled</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; padding: 30px 20px 20px 20px; background-color: white;">
            <div style="width: 100px; height: 100px; margin: 0 auto; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: 4px solid #1a1a1a; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <span style="color: white; font-size: 42px; font-weight: bold;">HS</span>
            </div>
            <h1 style="color: #1a1a1a; margin: 20px 0 0 0; font-size: 26px; font-weight: bold; line-height: 1.3;">Your job with Hey Spruce has been scheduled</h1>
          </div>
          <div style="padding: 30px; background-color: white;">
            <div style="margin-bottom: 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">When:</h2>
              <p style="color: #333; margin: 0; font-size: 16px; line-height: 1.5;">Monday February 10, 2026 arriving between 10:00am - 12:00pm</p>
            </div>
            <div style="margin-bottom: 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">Address:</h2>
              <p style="color: #333; margin: 0 0 15px 0; font-size: 16px; line-height: 1.5;">Downtown Restaurant<br>123 Main Street, Los Angeles, CA 90001</p>
              <div style="margin-top: 15px;">
                <a href="https://www.google.com/maps/search/?api=1&query=123+Main+Street+Los+Angeles+CA+90001" target="_blank" style="display: block; text-decoration: none; border-radius: 8px; overflow: hidden; border: 1px solid #d1d5db;">
                  <div style="width: 100%; height: 300px; background-color: #e5e7eb; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #4b5563;">
                    <div style="font-size: 48px; margin-bottom: 10px;">📍</div>
                    <p style="margin: 0; font-size: 14px; font-weight: 500; color: #10b981;">Click to view on Google Maps</p>
                  </div>
                </a>
              </div>
            </div>
            <div style="margin-bottom: 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">Services:</h2>
              <p style="color: #333; margin: 0 0 15px 0; font-size: 16px; line-height: 1.5;"><strong>WO-2026-001</strong> Deep Cleaning Service</p>
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;"><strong>3.9% card payment fee</strong></p>
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">If you pay by credit or debit card, a 3.9% processing fee will be added to the total amount. To avoid this fee, you can choose to pay with cash, Zelle, check, or ACH transfer.</p>
              <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">We offer financing through our partner company, Wisetack. You can learn more <a href="https://www.wisetack.com" target="_blank" style="color: #10b981; text-decoration: underline;">here</a>.</p>
            </div>
          </div>
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #4b5563;"><a href="tel:1-877-253-26464" style="color: #10b981; text-decoration: none; margin-right: 10px;">1-877-253-26464</a> | <a href="mailto:info@heyspruce.com" style="color: #10b981; text-decoration: none; margin: 0 10px;">info@heyspruce.com</a></p>
            <p style="margin: 10px 0; font-size: 14px; color: #4b5563;"><a href="https://www.heyspruce.com/" target="_blank" style="color: #10b981; text-decoration: none;">https://www.heyspruce.com/</a></p>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #4b5563;">1972 E 20th St, Los Angeles, CA 90058</p>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("Your job with Hey Spruce has been scheduled - WO-2026-001", html);
}

// 3. Subcontractor Approval
async function sendSubcontractorApproval() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Approved</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">✓ Account Approved!</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello John Contractor (ABC Cleaning Services),</p>
          <p style="font-size: 16px; margin-bottom: 20px;">Great news! Your Hey Spruce subcontractor account has been approved by Admin User.</p>
          <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0; font-size: 16px; color: #065f46;"><strong>✓ You can now access the Subcontractor Portal</strong></p>
          </div>
          <p style="font-size: 16px; margin-bottom: 30px;">Login to your account to:</p>
          <ul style="font-size: 16px; margin-bottom: 30px; padding-left: 20px;">
            <li style="margin-bottom: 10px;">View and bid on available work orders</li>
            <li style="margin-bottom: 10px;">Submit quotes for projects</li>
            <li style="margin-bottom: 10px;">Track your assigned work orders</li>
            <li style="margin-bottom: 10px;">Communicate with clients and administrators</li>
            <li style="margin-bottom: 10px;">Manage your business profile and skills</li>
          </ul>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/portal-login" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">Login to Subcontractor Portal</a>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("Your Hey Spruce Subcontractor Account Has Been Approved!", html);
}

// 4. Client Approval
async function sendClientApproval() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Approved</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">✓ Account Approved!</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello Jane Client,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">Great news! Your Hey Spruce account has been approved by Admin User.</p>
          <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0; font-size: 16px; color: #065f46;"><strong>✓ You can now access the Client Portal</strong></p>
          </div>
          <p style="font-size: 16px; margin-bottom: 30px;">Login to your account to:</p>
          <ul style="font-size: 16px; margin-bottom: 30px; padding-left: 20px;">
            <li style="margin-bottom: 10px;">View and manage work orders</li>
            <li style="margin-bottom: 10px;">Review and approve quotes from contractors</li>
            <li style="margin-bottom: 10px;">Track the status of ongoing projects</li>
            <li style="margin-bottom: 10px;">Communicate with your service providers</li>
          </ul>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/portal-login" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">Login to Client Portal</a>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("Your Hey Spruce Account Has Been Approved!", html);
}

// 5. Bidding Opportunity
async function sendBiddingOpportunity() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Bidding Opportunity</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">New Bidding Opportunity</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello John Contractor,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">A new work order is available for bidding that matches your skills.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #10b981;">Restaurant Deep Cleaning Service</h2>
            <p style="margin: 0 0 10px 0;"><strong>Work Order Number:</strong> WO-BID-2026-001</p>
            <p style="margin: 0 0 10px 0;"><strong>Category:</strong> Cleaning</p>
            <p style="margin: 0 0 10px 0;"><strong>Location:</strong> Downtown Restaurant</p>
            <p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: #f59e0b; font-weight: bold;">Medium</span></p>
            <p style="margin: 15px 0 0 0; padding-top: 15px; border-top: 1px solid #e5e7eb;"><strong>Description:</strong><br/>Complete deep cleaning of restaurant including kitchen, dining area, restrooms, and storage areas. Includes floor scrubbing, equipment cleaning, and sanitization.</p>
          </div>
          <p style="font-size: 16px; margin-bottom: 30px;">Review the work order details and submit your quote in the Subcontractor Portal:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/subcontractor-portal/bidding" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">Submit Quote</a>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("New Bidding Opportunity: Restaurant Deep Cleaning Service", html);
}

// 6. Review Request
async function sendReviewRequest() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rate Your Service - HeySpruce</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #ffffff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <img src="https://cdn.prod.website-files.com/67edc7c78e3151d3b06686b2/681007b1b7f5a5cc527f1b94_Hey_SPRUCE_logo_font.png" alt="HeySpruce Logo" style="max-width: 200px; height: auto; margin: 0 auto; display: block;" />
          </div>
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="font-size: 28px; font-weight: bold; color: #000000; margin: 0 0 10px 0; line-height: 1.3;">Please rate your service with<br>HeySpruce</h1>
          </div>
          <div style="text-align: center; margin-bottom: 50px;">
            <div style="margin-bottom: 20px;">
              <a href="https://www.google.com/maps/place/Spruce+Cleaning+%26+Maintenance/@34.0204789,-118.4117326,10z/data=!3m1!4b1!4m6!3m5!1s0x20a5e683df0722d:0x409439675ca2c8b!8m2!3d34.020479!4d-118.4117326!16s%2Fg%2F11xw24xtqb?entry=ttu&g_ep=EgoyMDI1MTExNy4wIKXMDSoASAFQAw%3D%3D" style="text-decoration: none; display: inline-block;">
                <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 15px;">
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer;">★</span>
                  <span style="font-size: 36px; color: #d3d3d3; cursor: pointer;">★</span>
                </div>
              </a>
              <div style="display: flex; justify-content: space-between; max-width: 400px; margin: 0 auto; padding: 0 20px;">
                <span style="font-size: 14px; color: #000000;">Poor</span>
                <span style="font-size: 14px; color: #000000;">Excellent</span>
              </div>
            </div>
            <div style="margin-top: 30px;">
              <a href="https://www.google.com/maps/place/Spruce+Cleaning+%26+Maintenance/@34.0204789,-118.4117326,10z/data=!3m1!4b1!4m6!3m5!1s0x20a5e683df0722d:0x409439675ca2c8b!8m2!3d34.020479!4d-118.4117326!16s%2Fg%2F11xw24xtqb?entry=ttu&g_ep=EgoyMDI1MTExNy4wIKXMDSoASAFQAw%3D%3D" style="background-color: #4285f4; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Leave a Review on Google</a>
            </div>
          </div>
          <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
            <div style="text-align: center; color: #000000; font-size: 14px; line-height: 2;">
              <p style="margin: 5px 0;"><strong>Phone:</strong> <a href="tel:1-877-253-26464" style="color: #4285f4; text-decoration: none;">1-877-253-26464</a></p>
              <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:info@heyspruce.com" style="color: #4285f4; text-decoration: none;">info@heyspruce.com</a></p>
              <p style="margin: 5px 0;"><strong>Website:</strong> <a href="https://www.heyspruce.com/" style="color: #4285f4; text-decoration: none;">https://www.heyspruce.com/</a></p>
              <p style="margin: 5px 0;"><strong>Address:</strong><br>1972 E 20th St, Los Angeles, CA 90058</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("How was your service with HeySpruce? - Work Order WO-2026-001", html);
}

// 7. Quote Notification
async function sendQuoteNotification() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Quote Received</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">New Quote Received</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello Jane Client,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">A new quote has been submitted for <strong>Work Order WO-QUOTE-2026-001</strong>.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0 0 10px 0;"><strong>Work Order:</strong> Restaurant Deep Cleaning Service</p>
            <p style="margin: 0 0 10px 0;"><strong>Submitted by:</strong> ABC Cleaning Services</p>
            <p style="margin: 0 0 10px 0;"><strong>Quote Amount:</strong> $1,500.00</p>
            <p style="margin: 0 0 10px 0;"><strong>Proposed Service Date:</strong> February 15, 2026</p>
            <p style="margin: 0;"><strong>Proposed Service Time:</strong> 2:00 PM</p>
          </div>
          <p style="font-size: 16px; margin-bottom: 30px;">View the full quote details in your portal:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/admin-portal/quotes" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">View Quote</a>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("New Quote Received for Work Order WO-QUOTE-2026-001", html);
}

// 8. Assignment Email
async function sendAssignment() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Work Order Assignment - WO-ASSIGN-2026-001</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Hey Spruce Restaurant Cleaning & Maintenance</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Restaurant Cleaning & Maintenance</p>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #10b981; margin-top: 0;">Work Order Assigned to You</h2>
          <p>Hi John Contractor,</p>
          <p>Great news! You have been assigned to a new work order. The client has approved your quote and is ready for you to begin work.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="margin-top: 0; color: #10b981;">Work Order Details</h3>
            <p><strong>Work Order Number:</strong> WO-ASSIGN-2026-001</p>
            <p><strong>Title:</strong> Restaurant Deep Cleaning Service</p>
            <p><strong>Client:</strong> Downtown Restaurant</p>
            <p><strong>Location:</strong> Main Location</p>
            <p><strong>Address:</strong> 123 Main Street, Los Angeles, CA 90001</p>
          </div>
          <div style="background: #dcfce7; padding: 15px; border-left: 4px solid #10b981; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px;"><strong>Next Steps:</strong><br>1. Log in to your subcontractor portal<br>2. Review the work order details<br>3. Accept the assignment and schedule your service date</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/subcontractor-portal/assigned" style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">View Work Order</a>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("Work Order Assignment: WO-ASSIGN-2026-001 - Restaurant Deep Cleaning Service", html);
}

// 9. Quote Email (Detailed)
async function sendQuote() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quote #Q-2026-001</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Hey Spruce Restaurant Cleaning & Maintenance</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Restaurant Cleaning & Maintenance</p>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #667eea; margin-top: 0;">New Quote Available</h2>
          <p>Hi Jane Client,</p>
          <p>We have prepared a quote for your service request: <strong>Restaurant Deep Cleaning Service</strong></p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="margin-top: 0; color: #667eea;">Quote Details</h3>
            <p><strong>Quote Number:</strong> Q-2026-001</p>
            <p><strong>Work Order:</strong> Restaurant Deep Cleaning Service</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background: #667eea; color: white;">
                  <th style="padding: 10px; text-align: left;">Description</th>
                  <th style="padding: 10px; text-align: center;">Qty</th>
                  <th style="padding: 10px; text-align: right;">Unit Price</th>
                  <th style="padding: 10px; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Deep cleaning service</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">1</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$1,500.00</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$1,500.00</td>
                </tr>
              </tbody>
            </table>
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #667eea;">
              <p style="font-size: 24px; font-weight: bold; color: #667eea; margin: 0;">Total: $1,500.00</p>
            </div>
            <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px;"><strong>Note:</strong> This quote includes all labor and materials. Valid for 30 days.</p>
            </div>
          </div>
          <p>Please review the quote and let us know if you have any questions or would like to proceed.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/client-portal/quotes" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">View Quote in Portal</a>
          </div>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("Quote #Q-2026-001 - Restaurant Deep Cleaning Service", html);
}

// 10. Invoice Email (with PDF attachments and Stripe link)
async function sendInvoice() {
  // Create sample PDFs
  const invoicePdfBase64 = createSamplePDFBase64("Invoice INV-2026-001");
  const workOrderPdfBase64 = createSamplePDFBase64("Work Order WO-2026-001");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice #INV-2026-001 due from Cleaning & Maintenance - $2,000.00</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background-color: #ffffff; padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h1 style="margin: 0; font-size: 16px; font-weight: bold; color: #1f2937;">Invoice INV-2026-001 due from Cleaning & Maintenance - $2,000.00</h1>
              <div style="display: flex; gap: 10px; align-items: center;">
                <span style="color: #6b7280; font-size: 12px;">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
              </div>
            </div>
          </div>
          <div style="background-color: #ffffff; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 24px; font-weight: bold; color: #1f2937;">Cleaning & Maintenance</h2>
          </div>
          <div style="background-color: #ffffff; padding: 20px 0; text-align: center;">
            <div style="width: 100px; height: 100px; margin: 0 auto; border-radius: 50%; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); border: 4px solid #1f2937; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <span style="color: #1f2937; font-size: 32px; font-weight: bold;">HS</span>
            </div>
          </div>
          <div style="background-color: #ffffff; padding: 0 20px 20px 20px; text-align: center;">
            <h3 style="margin: 0; font-size: 20px; font-weight: bold; color: #1f2937;">Your invoice from Cleaning & Maintenance</h3>
          </div>
          <div style="background-color: #e0f2fe; padding: 20px; margin: 0 20px 20px 20px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
              <div>
                <p style="margin: 0; font-size: 16px; font-weight: bold; color: #0369a1;">Pay as low as $166.67/mo*</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #0369a1;">Complete a short application to buy now and pay over time.</p>
              </div>
              <a href="https://www.wisetack.com" style="background-color: #0369a1; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; margin-top: 10px;">APPLY NOW</a>
            </div>
          </div>
          <div style="background-color: #ffffff; padding: 20px;">
            <p style="margin: 0 0 15px 0; font-size: 16px; color: #1f2937;">Hi Jane,</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">Thank you for choosing Cleaning & Maintenance. Please see attached invoice due net 10.</p>
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;"><strong>Invoice Number:</strong> #INV-2026-001</p>
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;"><strong>Service Date:</strong> ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;"><strong>Customer Name:</strong> Jane Client</p>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #374151;">Invoice for completed work order: WO-2026-001</p>
            </div>
            <div style="margin-bottom: 20px;">
              <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold; color: #1f2937;">Services</h4>
              <table style="width: 100%; border-collapse: collapse; background-color: #ffffff;">
                <thead>
                  <tr style="background-color: #f3f4f6;">
                    <th style="padding: 10px; text-align: left; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">Description</th>
                    <th style="padding: 10px; text-align: center; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">qty</th>
                    <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">unit price</th>
                    <th style="padding: 10px; text-align: right; font-size: 14px; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Service labor</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">1.0</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$1,500.00</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$1,500.00</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Materials</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">1.0</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$500.00</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$500.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-top: 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 14px; color: #374151; font-weight: bold;">Subtotal:</span>
                <span style="font-size: 14px; color: #374151; font-weight: bold;">$2,000.00</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 2px solid #1f2937;">
                <span style="font-size: 20px; color: #1f2937; font-weight: bold;">Amount Due:</span>
                <span style="font-size: 24px; color: #1f2937; font-weight: bold;">$2,000.00</span>
              </div>
            </div>
          </div>
          <div style="background-color: #ffffff; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <a href="https://buy.stripe.com/test-link" style="background-color: #0369a1; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px; display: inline-block;">Pay</a>
          </div>
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">Cleaning & Maintenance<br>1972 E 20th St, Los Angeles, CA 90058<br>Phone: <a href="tel:1-877-253-26464" style="color: #0369a1; text-decoration: none;">1-877-253-26464</a> | Email: <a href="mailto:info@heyspruce.com" style="color: #0369a1; text-decoration: none;">info@heyspruce.com</a> | Website: <a href="https://www.heyspruce.com/" style="color: #0369a1; text-decoration: none;">www.heyspruce.com</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const attachments = [
    {
      filename: "Invoice_INV-2026-001.pdf",
      content: invoicePdfBase64,
      type: "application/pdf",
    },
    {
      filename: "WorkOrder_Restaurant_Deep_Cleaning_Service.pdf",
      content: workOrderPdfBase64,
      type: "application/pdf",
    },
  ];

  return await sendEmail("Invoice #INV-2026-001 - Payment Due", html, attachments);
}

// 11. Invitation Email
async function sendInvitation() {
  const resetLink = `${APP_URL}/set-password?token=test-token-12345&email=${encodeURIComponent(TO_EMAIL)}`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Hey Spruce</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Hey Spruce!</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello Waseem,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">You've been invited to join Hey Spruce as a <strong>Client</strong>. To get started, you'll need to set up your password.</p>
          <p style="font-size: 16px; margin-bottom: 30px;">Click the button below to create your password and activate your account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">Set Up Password</a>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">Or copy and paste this link into your browser:</p>
          <p style="font-size: 14px; color: #10b981; word-break: break-all;">${resetLink}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;"><strong>Your Account Details:</strong></p>
          <ul style="font-size: 14px; color: #6b7280;">
            <li><strong>Email:</strong> ${TO_EMAIL}</li>
            <li><strong>Role:</strong> Client</li>
            <li><strong>Portal:</strong> Client Portal</li>
          </ul>
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">Once you've set your password, you can log in at: <a href="${APP_URL}/portal-login" style="color: #10b981; text-decoration: none;">${APP_URL}/portal-login</a></p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">If you didn't expect this invitation, you can safely ignore this email. This link will expire in 24 hours.</p>
        </div>
      </body>
    </html>
  `;
  return await sendEmail("Welcome to Hey Spruce - Set Up Your Client Account", html);
}

// Main execution
async function run() {
  console.log("🚀 Starting comprehensive email flow tests...\n");
  console.log(`📧 From: ${FROM_EMAIL}`);
  console.log(`📧 To: ${TO_EMAIL}\n`);
  console.log("=" .repeat(60) + "\n");

  const results = [];

  // Send all emails
  results.push({ name: "1. Maintenance Request Notification", ...(await sendMaintenanceRequestNotification()) });
  await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

  results.push({ name: "2. Scheduled Service", ...(await sendScheduledService()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "3. Subcontractor Approval", ...(await sendSubcontractorApproval()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "4. Client Approval", ...(await sendClientApproval()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "5. Bidding Opportunity", ...(await sendBiddingOpportunity()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "6. Review Request", ...(await sendReviewRequest()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "7. Quote Notification", ...(await sendQuoteNotification()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "8. Assignment Email", ...(await sendAssignment()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "9. Quote Email", ...(await sendQuote()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "10. Invoice Email (with PDFs)", ...(await sendInvoice()) });
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.push({ name: "11. Invitation Email", ...(await sendInvitation()) });

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Summary:\n");
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(r => {
    const status = r.success ? "✅" : "❌";
    console.log(`${status} ${r.name}`);
  });

  console.log(`\n✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  
  if (failed === 0) {
    console.log("\n🎉 All emails sent successfully!");
  }
}

run().catch((err) => {
  console.error("\n❌ Test script failed:", err);
  process.exit(1);
});
