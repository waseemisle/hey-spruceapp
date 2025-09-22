#!/usr/bin/env node

/**
 * Cron job script to execute scheduled invoices
 * This script should be run every hour to check for due scheduled invoices
 * 
 * Usage:
 * 1. Add to crontab: 0 * * * * /usr/bin/node /path/to/scripts/execute-scheduled-invoices.js
 * 2. Or run manually: node scripts/execute-scheduled-invoices.js
 */

const https = require('https');
const http = require('http');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINT = '/api/admin/scheduled-invoices/execute';

console.log('=== SCHEDULED INVOICES CRON JOB START ===');
console.log('Timestamp:', new Date().toISOString());
console.log('API URL:', API_BASE_URL + API_ENDPOINT);

// Make HTTP request to execute scheduled invoices
const url = new URL(API_ENDPOINT, API_BASE_URL);
const isHttps = url.protocol === 'https:';
const client = isHttps ? https : http;

const options = {
  hostname: url.hostname,
  port: url.port || (isHttps ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Scheduled-Invoices-Cron/1.0'
  }
};

const req = client.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (res.statusCode === 200 && response.success) {
        console.log('✅ Scheduled invoices executed successfully');
        console.log('Response:', JSON.stringify(response, null, 2));
      } else {
        console.error('❌ Failed to execute scheduled invoices');
        console.error('Status Code:', res.statusCode);
        console.error('Response:', JSON.stringify(response, null, 2));
      }
    } catch (parseError) {
      console.error('❌ Failed to parse response');
      console.error('Raw response:', data);
      console.error('Parse error:', parseError.message);
    }
    
    console.log('=== SCHEDULED INVOICES CRON JOB END ===');
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.log('=== SCHEDULED INVOICES CRON JOB END ===');
});

req.on('timeout', () => {
  console.error('❌ Request timed out');
  req.destroy();
  console.log('=== SCHEDULED INVOICES CRON JOB END ===');
});

// Set timeout to 30 seconds
req.setTimeout(30000);

// Send the request
req.write(JSON.stringify({}));
req.end();
