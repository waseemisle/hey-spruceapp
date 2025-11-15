/**
 * Helper script to convert Firebase Admin Service Account JSON to .env.local format
 * 
 * Usage:
 *   1. Download the service account JSON from Firebase Console
 *   2. Run: node scripts/setup-firebase-admin.js path/to/your-service-account.json
 *   3. Copy the output to your .env.local file
 */

const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2];

if (!jsonPath) {
  console.error('❌ Error: Please provide the path to your Firebase service account JSON file');
  console.log('\nUsage: node scripts/setup-firebase-admin.js path/to/service-account.json\n');
  process.exit(1);
}

if (!fs.existsSync(jsonPath)) {
  console.error(`❌ Error: File not found: ${jsonPath}`);
  process.exit(1);
}

try {
  const jsonContent = fs.readFileSync(jsonPath, 'utf8');
  const serviceAccount = JSON.parse(jsonContent);

  const projectId = serviceAccount.project_id;
  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Error: Invalid service account JSON. Missing required fields.');
    process.exit(1);
  }

  // Convert private key newlines to \n format
  const formattedPrivateKey = privateKey.replace(/\n/g, '\\n');

  console.log('\n✅ Firebase Admin credentials extracted successfully!\n');
  console.log('Copy these lines to your .env.local file:\n');
  console.log('─'.repeat(60));
  console.log(`FIREBASE_PROJECT_ID=${projectId}`);
  console.log(`FIREBASE_CLIENT_EMAIL=${clientEmail}`);
  console.log(`FIREBASE_PRIVATE_KEY="${formattedPrivateKey}"`);
  console.log('─'.repeat(60));
  console.log('\n✅ Done! Restart your dev server after adding these to .env.local\n');

} catch (error) {
  console.error('❌ Error reading JSON file:', error.message);
  process.exit(1);
}

