#!/usr/bin/env node

/**
 * Test Email Functionality
 * 
 * This script tests the email configuration and sends a test email
 * to verify that the approval notification system is working.
 * 
 * Usage:
 * node scripts/test-email.mjs [email@example.com]
 */

import fetch from 'node-fetch'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const TEST_EMAIL = process.argv[2] || 'test@example.com'

console.log('🧪 Testing Email Configuration...\n')

async function testEmailConfig() {
  try {
    console.log('1. Checking email configuration...')
    const configResponse = await fetch(`${API_BASE}/api/test-email`)
    const configResult = await configResponse.json()
    
    if (configResult.success) {
      console.log('✅ Email configuration is valid')
      console.log(`   SMTP Host: ${configResult.smtpHost}`)
      console.log(`   SMTP User: ${configResult.smtpUser}`)
      console.log(`   SMTP Pass: ${configResult.smtpPass}`)
      return true
    } else {
      console.log('❌ Email configuration is invalid')
      console.log(`   Error: ${configResult.error}`)
      return false
    }
  } catch (error) {
    console.log('❌ Failed to check email configuration')
    console.log(`   Error: ${error.message}`)
    return false
  }
}

async function sendTestEmail() {
  try {
    console.log('\n2. Sending test approval email...')
    console.log(`   To: ${TEST_EMAIL}`)
    
    const emailResponse = await fetch(`${API_BASE}/api/test-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        testEmail: TEST_EMAIL,
        clientName: 'Test Client',
        companyName: 'Test Company Inc.'
      })
    })
    
    const emailResult = await emailResponse.json()
    
    if (emailResult.success) {
      console.log('✅ Test email sent successfully!')
      console.log(`   Message ID: ${emailResult.messageId}`)
      console.log(`   Check your inbox at: ${TEST_EMAIL}`)
      return true
    } else {
      console.log('❌ Failed to send test email')
      console.log(`   Error: ${emailResult.error}`)
      if (emailResult.details) {
        console.log(`   Details: ${emailResult.details}`)
      }
      return false
    }
  } catch (error) {
    console.log('❌ Failed to send test email')
    console.log(`   Error: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('📧 Spruce App Email Test\n')
  console.log(`API Base: ${API_BASE}`)
  console.log(`Test Email: ${TEST_EMAIL}\n`)
  
  const configValid = await testEmailConfig()
  
  if (!configValid) {
    console.log('\n❌ Email configuration is invalid. Please check your .env.local file.')
    console.log('\n📖 Setup Guide:')
    console.log('   1. Copy env.example to .env.local')
    console.log('   2. Configure SMTP settings')
    console.log('   3. Run this test again')
    process.exit(1)
  }
  
  const emailSent = await sendTestEmail()
  
  if (emailSent) {
    console.log('\n🎉 Email system is working correctly!')
    console.log('\nNext steps:')
    console.log('   1. Register a test client account')
    console.log('   2. Go to Admin Portal → Client Approvals')
    console.log('   3. Approve the test registration')
    console.log('   4. Check if the approval email was sent')
  } else {
    console.log('\n❌ Email system test failed')
    console.log('\nTroubleshooting:')
    console.log('   1. Check your SMTP credentials')
    console.log('   2. Verify your email service settings')
    console.log('   3. Check the EMAIL_SETUP_GUIDE.md for help')
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

main().catch(console.error)
