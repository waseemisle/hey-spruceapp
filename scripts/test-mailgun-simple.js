// Simple Mailgun test script
// Usage: node scripts/test-mailgun-simple.js

const FormData = require("form-data");
const Mailgun = require("mailgun.js");

const API_KEY = process.env.MAILGUN_API_KEY;
const DOMAIN = process.env.MAILGUN_DOMAIN || "groundops.com";
const FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || "info@groundops.com";
const TO_EMAIL = process.env.TEST_EMAIL_TO || "waseemisle@gmail.com";

if (!API_KEY) {
  console.error("❌ Error: MAILGUN_API_KEY environment variable is required");
  console.error("   Please set it in your .env.local file or export it before running this script");
  process.exit(1);
}

async function sendTestEmail() {
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: "api",
    key: API_KEY,
    // For EU domains, use: url: "https://api.eu.mailgun.net"
  });

  try {
    console.log("📧 Sending test email...");
    console.log(`   From: ${FROM_EMAIL}`);
    console.log(`   To: ${TO_EMAIL}`);
    console.log(`   Domain: ${DOMAIN}`);

    const data = await mg.messages.create(DOMAIN, {
      from: `Matthew <${FROM_EMAIL}>`,
      to: [TO_EMAIL],
      subject: "Test Email from Mailgun",
      text: "This is a test email sent via Mailgun. If you receive this, the integration is working!",
      html: `
        <html>
          <body>
            <h2>Test Email from Mailgun</h2>
            <p>This is a test email sent via Mailgun.</p>
            <p>If you receive this, the integration is working correctly!</p>
            <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
          </body>
        </html>
      `,
    });

    console.log("\n✅ Email sent successfully!");
    console.log("📧 Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("\n❌ Error sending email:");
    console.error(error);
    
    if (error.status) {
      console.error(`Status: ${error.status}`);
    }
    if (error.details) {
      console.error(`Details:`, error.details);
    }
    if (error.message) {
      console.error(`Message: ${error.message}`);
    }
    
    process.exit(1);
  }
}

sendTestEmail();
