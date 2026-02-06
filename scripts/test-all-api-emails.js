// Comprehensive test script to test all email API routes
// Usage: node scripts/test-all-api-emails.js
// Make sure your dev server is running: npm run dev

const http = require('http');
const https = require('https');

const RECIPIENT = 'waseemisle@gmail.com';
const BASE_URL = process.env.TEST_EMAIL_BASE_URL || 'http://localhost:3000';

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = JSON.stringify(payload);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = client.request(options, (res) => {
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
    req.write(data);
    req.end();
  });
}

// Helper to create sample PDF base64
function createSamplePDFBase64(content = "Sample PDF Document") {
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

async function run() {
  console.log('🚀 Testing all email API routes...\n');
  console.log(`📧 All emails will be sent to: ${RECIPIENT}`);
  console.log(`🌐 API Base URL: ${BASE_URL}\n`);
  console.log('='.repeat(60) + '\n');

  const results = [];

  // 1) Maintenance request notification
  console.log('1️⃣  Testing: Maintenance Request Notification...');
  results.push({
    name: 'send-maint-request-notification',
    ...(await postJson('/api/email/send-maint-request-notification', {
      toEmail: RECIPIENT,
      toName: 'Test Admin',
      maintRequestId: 'TEST-MAINT-2026-001',
      venue: 'Downtown Restaurant',
      requestor: 'John Manager',
      title: 'HVAC System Not Working',
      description: 'The HVAC system in the main dining area is not cooling properly. Temperature is rising and customers are complaining.',
      priority: 'high',
      date: new Date().toISOString(),
      portalLink: `${BASE_URL}/admin-portal/work-orders`,
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 2) Scheduled service
  console.log('2️⃣  Testing: Scheduled Service...');
  results.push({
    name: 'send-scheduled-service',
    ...(await postJson('/api/email/send-scheduled-service', {
      toEmail: RECIPIENT,
      toName: 'Jane Client',
      workOrderNumber: 'WO-SCHED-2026-001',
      workOrderTitle: 'Deep Cleaning Service',
      scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      scheduledTimeStart: '10:00',
      scheduledTimeEnd: '12:00',
      locationName: 'Downtown Restaurant',
      locationAddress: {
        addressLine1: '123 Main Street',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001',
      },
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 3) Subcontractor approval
  console.log('3️⃣  Testing: Subcontractor Approval...');
  results.push({
    name: 'send-subcontractor-approval',
    ...(await postJson('/api/email/send-subcontractor-approval', {
      toEmail: RECIPIENT,
      toName: 'John Contractor',
      businessName: 'ABC Cleaning Services',
      approvedBy: 'Admin User',
      portalLink: `${BASE_URL}/portal-login`,
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 4) Client approval
  console.log('4️⃣  Testing: Client Approval...');
  results.push({
    name: 'send-client-approval',
    ...(await postJson('/api/email/send-client-approval', {
      toEmail: RECIPIENT,
      toName: 'Jane Client',
      approvedBy: 'Admin User',
      portalLink: `${BASE_URL}/portal-login`,
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 5) Bidding opportunity
  console.log('5️⃣  Testing: Bidding Opportunity...');
  results.push({
    name: 'send-bidding-opportunity',
    ...(await postJson('/api/email/send-bidding-opportunity', {
      toEmail: RECIPIENT,
      toName: 'John Contractor',
      workOrderNumber: 'WO-BID-2026-001',
      workOrderTitle: 'Restaurant Deep Cleaning Service',
      workOrderDescription: 'Complete deep cleaning of restaurant including kitchen, dining area, restrooms, and storage areas. Includes floor scrubbing, equipment cleaning, and sanitization.',
      locationName: 'Downtown Restaurant',
      category: 'Cleaning',
      priority: 'medium',
      portalLink: `${BASE_URL}/subcontractor-portal/bidding`,
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 6) Review request
  console.log('6️⃣  Testing: Review Request...');
  results.push({
    name: 'send-review-request',
    ...(await postJson('/api/email/send-review-request', {
      toEmail: RECIPIENT,
      toName: 'Jane Client',
      workOrderNumber: 'WO-REVIEW-2026-001',
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 7) Quote notification (simple)
  console.log('7️⃣  Testing: Quote Notification...');
  results.push({
    name: 'send-quote-notification',
    ...(await postJson('/api/email/send-quote-notification', {
      toEmail: RECIPIENT,
      toName: 'Jane Client',
      workOrderNumber: 'WO-QUOTE-2026-001',
      workOrderTitle: 'Restaurant Deep Cleaning Service',
      subcontractorName: 'ABC Cleaning Services',
      quoteAmount: 1500.00,
      proposedServiceDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      proposedServiceTime: '14:00',
      portalLink: `${BASE_URL}/admin-portal/quotes`,
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 8) Assignment email
  console.log('8️⃣  Testing: Assignment Email...');
  results.push({
    name: 'send-assignment',
    ...(await postJson('/api/email/send-assignment', {
      toEmail: RECIPIENT,
      toName: 'John Contractor',
      workOrderNumber: 'WO-ASSIGN-2026-001',
      workOrderTitle: 'Restaurant Deep Cleaning Service',
      clientName: 'Downtown Restaurant',
      locationName: 'Main Location',
      locationAddress: '123 Main Street, Los Angeles, CA 90001',
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 9) Quote email (detailed)
  console.log('9️⃣  Testing: Quote Email...');
  results.push({
    name: 'send-quote',
    ...(await postJson('/api/email/send-quote', {
      toEmail: RECIPIENT,
      toName: 'Jane Client',
      quoteNumber: 'Q-2026-001',
      workOrderTitle: 'Restaurant Deep Cleaning Service',
      totalAmount: 1500,
      clientAmount: 1500,
      markupPercentage: 10,
      lineItems: [
        {
          description: 'Deep cleaning service',
          quantity: 1,
          unitPrice: 1500,
          amount: 1500,
        },
      ],
      notes: 'This quote includes all labor and materials. Valid for 30 days.',
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 10) Invoice email (with PDFs and Stripe link)
  console.log('🔟 Testing: Invoice Email (with PDFs)...');
  const invoicePdfBase64 = createSamplePDFBase64("Invoice INV-2026-001");
  const workOrderPdfBase64 = createSamplePDFBase64("Work Order WO-2026-001");
  
  results.push({
    name: 'send-invoice',
    ...(await postJson('/api/email/send-invoice', {
      toEmail: RECIPIENT,
      toName: 'Jane Client',
      invoiceNumber: 'INV-2026-001',
      workOrderTitle: 'Restaurant Deep Cleaning Service',
      totalAmount: 2000,
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      lineItems: [
        {
          description: 'Service labor',
          quantity: 1,
          unitPrice: 1500,
          amount: 1500,
        },
        {
          description: 'Materials',
          quantity: 1,
          unitPrice: 500,
          amount: 500,
        },
      ],
      notes: 'Invoice for completed work order: WO-2026-001',
      stripePaymentLink: 'https://buy.stripe.com/test-link',
      pdfBase64: invoicePdfBase64,
      workOrderPdfBase64: workOrderPdfBase64,
    })),
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 11) Invitation email (generic)
  console.log('1️⃣1️⃣ Testing: Invitation Email...');
  results.push({
    name: 'send-invitation',
    ...(await postJson('/api/email/send-invitation', {
      email: RECIPIENT,
      fullName: 'Waseem',
      role: 'client',
      resetLink: `${BASE_URL}/set-password?token=test-token-12345&email=${encodeURIComponent(RECIPIENT)}`,
    })),
  });

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results:\n');

  let successCount = 0;
  let failCount = 0;

  for (const r of results) {
    const status = r.status === 200 && r.body && r.body.success ? '✅' : '❌';
    const statusText = r.status === 200 && r.body && r.body.success ? 'SUCCESS' : 'FAILED';
    
    if (status === '✅') successCount++;
    else failCount++;

    console.log(`${status} ${r.name}: ${statusText}`);
    console.log(`   Status Code: ${r.status}`);
    
    if (r.body && r.body.error) {
      console.log(`   Error: ${r.body.error}`);
      if (r.body.details) {
        console.log(`   Details: ${r.body.details}`);
      }
      if (r.body.suggestion) {
        console.log(`   Suggestion: ${r.body.suggestion}`);
      }
    } else if (r.body && r.body.success) {
      console.log(`   ✅ Email sent successfully!`);
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`\n✅ Successful: ${successCount}/${results.length}`);
  console.log(`❌ Failed: ${failCount}/${results.length}\n`);

  if (failCount === 0) {
    console.log('🎉 All email API routes are working correctly!');
    console.log(`📧 Check your inbox at ${RECIPIENT} to verify all emails were received.\n`);
  } else {
    console.log('⚠️  Some email routes failed. Check the errors above.\n');
    console.log('Common issues:');
    console.log('1. Make sure MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL are set');
    console.log('2. Ensure your dev server is running: npm run dev');
    console.log('3. Check that Mailgun domain is verified\n');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n❌ Test script failed:', err);
  process.exit(1);
});
