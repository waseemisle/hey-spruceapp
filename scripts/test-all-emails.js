// Simple script to exercise all email API routes locally.
// Usage (from repo root, with dev server running, e.g. on http://localhost:3000):
//   node scripts/test-all-emails.js
//
// All test emails are sent to: matthew@heyspruce.com

const http = require('http');

const RECIPIENT = 'matthew@heyspruce.com';
const BASE_URL = process.env.TEST_EMAIL_BASE_URL || 'http://localhost:3000';

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
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
    req.write(data);
    req.end();
  });
}

async function run() {
  const results = [];

  // 1) Maintenance request notification
  results.push({
    name: 'send-maint-request-notification',
    ...(await postJson('/api/email/send-maint-request-notification', {
      toEmail: RECIPIENT,
      toName: 'Test Admin',
      maintRequestId: 'TEST-MAINT-1',
      venue: 'Test Venue',
      requestor: 'Test Requestor',
      title: 'Test Maintenance Request',
      description: 'This is a test maintenance request email via Mailgun.',
      priority: 'normal',
      date: new Date().toISOString(),
    })),
  });

  // 2) Scheduled service
  results.push({
    name: 'send-scheduled-service',
    ...(await postJson('/api/email/send-scheduled-service', {
      toEmail: RECIPIENT,
      toName: 'Test Client',
      workOrderNumber: 'WO-TEST-001',
      workOrderTitle: 'Test Scheduled Service',
      scheduledDate: new Date().toISOString(),
      scheduledTimeStart: '10:00',
      scheduledTimeEnd: '12:00',
      locationName: 'Test Location',
      locationAddress: {
        addressLine1: '123 Test St',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001',
      },
    })),
  });

  // 3) Subcontractor approval
  results.push({
    name: 'send-subcontractor-approval',
    ...(await postJson('/api/email/send-subcontractor-approval', {
      toEmail: RECIPIENT,
      toName: 'Test Subcontractor',
      businessName: 'Test Business',
      approvedBy: 'Test Admin',
      portalLink: 'https://example.com/subcontractor-portal',
    })),
  });

  // 4) Client approval
  results.push({
    name: 'send-client-approval',
    ...(await postJson('/api/email/send-client-approval', {
      toEmail: RECIPIENT,
      toName: 'Test Client',
      approvedBy: 'Test Admin',
      portalLink: 'https://example.com/client-portal',
    })),
  });

  // 5) Bidding opportunity
  results.push({
    name: 'send-bidding-opportunity',
    ...(await postJson('/api/email/send-bidding-opportunity', {
      toEmail: RECIPIENT,
      toName: 'Test Subcontractor',
      workOrderNumber: 'WO-BID-001',
      workOrderTitle: 'Test Bidding Opportunity',
      workOrderDescription: 'This is a test work order for bidding.',
      locationName: 'Test Location',
      category: 'General',
      priority: 'medium',
      portalLink: 'https://example.com/subcontractor-portal/bidding',
    })),
  });

  // 6) Review request
  results.push({
    name: 'send-review-request',
    ...(await postJson('/api/email/send-review-request', {
      toEmail: RECIPIENT,
      toName: 'Test Client',
      workOrderNumber: 'WO-REVIEW-001',
    })),
  });

  // 7) Quote notification (simple)
  results.push({
    name: 'send-quote-notification',
    ...(await postJson('/api/email/send-quote-notification', {
      toEmail: RECIPIENT,
      toName: 'Test Client',
      workOrderNumber: 'WO-QUOTE-001',
      workOrderTitle: 'Test Quote Work Order',
      subcontractorName: 'Test Subcontractor',
      quoteAmount: 1234.56,
      proposedServiceDate: new Date().toISOString(),
      proposedServiceTime: '14:00',
      portalLink: 'https://example.com/admin-portal/quotes',
    })),
  });

  // 8) Assignment email
  results.push({
    name: 'send-assignment',
    ...(await postJson('/api/email/send-assignment', {
      toEmail: RECIPIENT,
      toName: 'Test Subcontractor',
      workOrderNumber: 'WO-ASSIGN-001',
      workOrderTitle: 'Test Assignment Work Order',
      clientName: 'Test Client',
      locationName: 'Test Location',
      locationAddress: '123 Test St, Los Angeles, CA 90001',
    })),
  });

  // 9) Quote email (detailed)
  results.push({
    name: 'send-quote',
    ...(await postJson('/api/email/send-quote', {
      toEmail: RECIPIENT,
      toName: 'Test Client',
      quoteNumber: 'Q-TEST-001',
      workOrderTitle: 'Test Quote Work Order',
      totalAmount: 1500,
      clientAmount: 1500,
      markupPercentage: 10,
      lineItems: [
        {
          description: 'Test service item',
          quantity: 1,
          unitPrice: 1500,
          amount: 1500,
        },
      ],
      notes: 'This is a test quote email.',
    })),
  });

  // 10) Invoice email (no attachments)
  results.push({
    name: 'send-invoice',
    ...(await postJson('/api/email/send-invoice', {
      toEmail: RECIPIENT,
      toName: 'Test Client',
      invoiceNumber: 'INV-TEST-001',
      workOrderTitle: 'Test Invoice Work Order',
      totalAmount: 2000,
      dueDate: new Date().toISOString(),
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
      notes: 'This is a test invoice email.',
      stripePaymentLink: 'https://example.com/pay',
      // pdfBase64 and workOrderPdfBase64 can be omitted for simple tests
    })),
  });

  // 11) Invitation email (generic)
  results.push({
    name: 'send-invitation',
    ...(await postJson('/api/email/send-invitation', {
      email: RECIPIENT,
      fullName: 'Test User',
      role: 'client',
      resetLink: 'https://example.com/set-password?token=TEST',
    })),
  });

  // Print a concise summary
  console.log('Email test results (Mailgun):');
  for (const r of results) {
    console.log(
      `- ${r.name}: status=${r.status}, success=${
        r.body && r.body.success
      }, error=${r.body && r.body.error ? r.body.error : 'none'}`,
    );
  }

  console.log(
    '\nNote: If you are on a Mailgun sandbox domain, you may still see 403 errors until the recipient is authorized or you use a production domain.',
  );
}

run().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});

