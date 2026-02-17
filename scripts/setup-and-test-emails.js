// Complete setup and test script for email functionality
// This script will test emails both directly and via API routes

const FormData = require("form-data");
const Mailgun = require("mailgun.js");
const http = require('http');

// Configuration
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
if (!MAILGUN_API_KEY) {
  console.error("❌ Error: MAILGUN_API_KEY environment variable is required");
  process.exit(1);
}
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "groundops.com";
const MAILGUN_FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || "info@groundops.com";
const TO_EMAIL = "waseemisle@gmail.com";
const API_BASE_URL = process.env.TEST_EMAIL_BASE_URL || "http://localhost:3000";

console.log("🔍 Email Configuration Check:\n");
console.log(`MAILGUN_API_KEY: ${MAILGUN_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`MAILGUN_DOMAIN: ${MAILGUN_DOMAIN ? '✅ Set' : '❌ Missing'}`);
console.log(`MAILGUN_FROM_EMAIL: ${MAILGUN_FROM_EMAIL ? '✅ Set' : '❌ Missing'}`);
console.log(`\n📧 Test recipient: ${TO_EMAIL}\n`);

// Test direct Mailgun sending
async function testDirectMailgun() {
  console.log("=".repeat(60));
  console.log("TEST 1: Direct Mailgun Integration\n");
  
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: "api",
    key: MAILGUN_API_KEY,
  });

  try {
    const testHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Direct Mailgun Test</h2>
          <p>This email was sent directly via Mailgun API to verify the integration is working.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        </body>
      </html>
    `;

    const data = await mg.messages.create(MAILGUN_DOMAIN, {
      from: `Matthew <${MAILGUN_FROM_EMAIL}>`,
      to: [TO_EMAIL],
      subject: "✅ Direct Mailgun Test - Integration Working",
      html: testHtml,
    });

    console.log("✅ Direct Mailgun test: SUCCESS");
    console.log(`   Message ID: ${data.id || data.message}\n`);
    return true;
  } catch (error) {
    console.log("❌ Direct Mailgun test: FAILED");
    console.log(`   Error: ${error.message || error}\n`);
    return false;
  }
}

// Test API route
async function testAPIRoute(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE_URL);
    const data = JSON.stringify(payload);
    
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          parsed = { raw: body };
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(data);
    req.end();
  });
}

// Test API routes
async function testAPIRoutes() {
  console.log("=".repeat(60));
  console.log("TEST 2: API Route Integration\n");
  console.log(`Testing against: ${API_BASE_URL}\n`);

  // Check if server is running
  try {
    await new Promise((resolve, reject) => {
      const url = new URL(API_BASE_URL);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: '/',
        method: 'GET',
        timeout: 5000,
      }, (res) => {
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Server not responding'));
      });
      req.end();
    });
  } catch (error) {
    console.log("⚠️  Dev server is not running!");
    console.log(`   Please start it with: npm run dev`);
    console.log(`   Then run this script again.\n`);
    return false;
  }

  console.log("✅ Dev server is running\n");

  const tests = [
    {
      name: "Invitation Email",
      endpoint: "/api/email/send-invitation",
      payload: {
        email: TO_EMAIL,
        fullName: "Waseem",
        role: "client",
        resetLink: `${API_BASE_URL}/set-password?token=test-token`,
      },
    },
    {
      name: "Maintenance Request",
      endpoint: "/api/email/send-maint-request-notification",
      payload: {
        toEmail: TO_EMAIL,
        toName: "Test Admin",
        maintRequestId: "TEST-001",
        venue: "Test Venue",
        title: "Test Maintenance Request",
        priority: "normal",
        date: new Date().toISOString(),
      },
    },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}...`);
      const result = await testAPIRoute(test.endpoint, test.payload);
      
      if (result.status === 200 && result.body.success) {
        console.log(`  ✅ ${test.name}: SUCCESS\n`);
        successCount++;
      } else {
        console.log(`  ❌ ${test.name}: FAILED`);
        console.log(`     Status: ${result.status}`);
        console.log(`     Error: ${result.body.error || result.body.details || 'Unknown error'}\n`);
        failCount++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`  ❌ ${test.name}: ERROR`);
      console.log(`     ${error.message}\n`);
      failCount++;
    }
  }

  console.log(`\nAPI Test Results: ${successCount} passed, ${failCount} failed\n`);
  return failCount === 0;
}

// Main execution
async function run() {
  console.log("\n🚀 Email System Test Suite\n");
  console.log("=".repeat(60) + "\n");

  // Test 1: Direct Mailgun
  const directTest = await testDirectMailgun();
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: API Routes
  const apiTest = await testAPIRoutes();

  // Summary
  console.log("=".repeat(60));
  console.log("\n📊 Test Summary:\n");
  console.log(`Direct Mailgun Integration: ${directTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API Route Integration: ${apiTest ? '✅ PASS' : '❌ FAIL'}`);

  if (directTest && apiTest) {
    console.log("\n🎉 All tests passed! Email system is working correctly.");
    console.log(`📧 Check your inbox at ${TO_EMAIL} to verify emails were received.\n`);
  } else if (directTest && !apiTest) {
    console.log("\n⚠️  Direct Mailgun works, but API routes need attention.");
    console.log("   Make sure:");
    console.log("   1. Dev server is running: npm run dev");
    console.log("   2. Environment variables are set in .env.local");
    console.log("   3. All dependencies are installed: npm install\n");
  } else {
    console.log("\n❌ Email system needs configuration.");
    console.log("   Please check:");
    console.log("   1. MAILGUN_API_KEY is set");
    console.log("   2. MAILGUN_DOMAIN is set");
    console.log("   3. MAILGUN_FROM_EMAIL is set");
    console.log("   4. Mailgun domain is verified\n");
  }
}

run().catch((err) => {
  console.error("\n❌ Test suite failed:", err);
  process.exit(1);
});
