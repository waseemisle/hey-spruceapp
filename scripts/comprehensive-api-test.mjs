import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8',
  authDomain: 'heyspruceappv2.firebaseapp.com',
  projectId: 'heyspruceappv2',
  storageBucket: 'heyspruceappv2.firebasestorage.app',
  messagingSenderId: '198738285054',
  appId: '1:198738285054:web:6878291b080771623a70af',
  measurementId: 'G-82NKE8271G'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testAllAPIs() {
  console.log('🌐 COMPREHENSIVE API TESTING\n');
  
  const testResults = {
    passed: 0,
    failed: 0,
    errors: []
  };

  const baseURL = 'http://localhost:3000';

  // Test all API endpoints
  const apiTests = [
    // Admin APIs
    { name: 'Admin Work Orders', url: `${baseURL}/api/workorders?userId=test&role=admin`, method: 'GET' },
    { name: 'Admin Subcontractors', url: `${baseURL}/api/admin/subcontractors`, method: 'GET' },
    { name: 'Admin Client Registrations', url: `${baseURL}/api/admin/list-registrations`, method: 'GET' },
    { name: 'Admin Quotes', url: `${baseURL}/api/admin/quotes`, method: 'GET' },
    { name: 'Admin Invoices', url: `${baseURL}/api/admin/invoices`, method: 'GET' },
    { name: 'Admin Scheduled Invoices', url: `${baseURL}/api/admin/scheduled-invoices`, method: 'GET' },
    
    // Client APIs
    { name: 'Client Work Orders', url: `${baseURL}/api/workorders?userId=l14Mfa3VghUCJjGajq9z7AC4I2T2&role=client`, method: 'GET' },
    { name: 'Client Quotes', url: `${baseURL}/api/client/quotes?clientId=l14Mfa3VghUCJjGajq9z7AC4I2T2`, method: 'GET' },
    
    // Subcontractor APIs
    { name: 'Subcontractor Work Orders', url: `${baseURL}/api/workorders?userId=BhgawC63sQTWsGheQMI3nmy7N392&role=subcontractor`, method: 'GET' },
    
    // Test APIs
    { name: 'Test Firestore', url: `${baseURL}/api/test-firestore`, method: 'GET' },
    { name: 'Test Email', url: `${baseURL}/api/test-email`, method: 'GET' },
    { name: 'Test SendGrid', url: `${baseURL}/api/test-sendgrid`, method: 'GET' },
    { name: 'Test Scheduled Invoices', url: `${baseURL}/api/test-scheduled-invoices`, method: 'GET' },
  ];

  for (const test of apiTests) {
    try {
      console.log(`🔍 Testing ${test.name}...`);
      const response = await fetch(test.url, { method: test.method });
      const data = await response.json();
      
      if (response.ok) {
        console.log(`   ✅ ${test.name}: ${response.status} - ${data.success ? 'Success' : 'API Error'}`);
        if (data.workOrders) console.log(`      📊 Work Orders: ${data.workOrders.length}`);
        if (data.subcontractors) console.log(`      📊 Subcontractors: ${data.subcontractors.length}`);
        if (data.registrations) console.log(`      📊 Registrations: ${data.registrations.length}`);
        if (data.quotes) console.log(`      📊 Quotes: ${data.quotes.length}`);
        if (data.invoices) console.log(`      📊 Invoices: ${data.invoices.length}`);
        if (data.scheduledInvoices) console.log(`      📊 Scheduled Invoices: ${data.scheduledInvoices.length}`);
        testResults.passed++;
      } else {
        console.log(`   ❌ ${test.name}: ${response.status} - ${data.error || 'Unknown error'}`);
        testResults.failed++;
        testResults.errors.push(`${test.name}: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`   ❌ ${test.name}: Network Error - ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`${test.name}: ${error.message}`);
    }
  }

  // Test POST endpoints
  console.log('\n📝 Testing POST Endpoints...');
  
  // Test scheduled invoice creation
  try {
    console.log('🔍 Testing Scheduled Invoice Creation...');
    const response = await fetch(`${baseURL}/api/admin/scheduled-invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'l14Mfa3VghUCJjGajq9z7AC4I2T2',
        title: 'Test Comprehensive Invoice',
        description: 'Comprehensive testing invoice',
        amount: '250.00',
        frequency: 'weekly',
        dayOfWeek: '1',
        time: '10:00',
        timezone: 'America/New_York',
        notes: 'Comprehensive test',
        adminId: 'test-admin',
        adminName: 'Test Admin',
        adminEmail: 'test@admin.com'
      })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      console.log('   ✅ Scheduled Invoice Creation: Success');
      console.log(`      🆔 Invoice ID: ${data.scheduledInvoiceId}`);
      testResults.passed++;
    } else {
      console.log(`   ❌ Scheduled Invoice Creation: ${data.error || 'Unknown error'}`);
      testResults.failed++;
      testResults.errors.push(`Scheduled Invoice Creation: ${data.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.log(`   ❌ Scheduled Invoice Creation: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`Scheduled Invoice Creation: ${error.message}`);
  }

  // Test scheduled invoice execution
  try {
    console.log('🔍 Testing Scheduled Invoice Execution...');
    const response = await fetch(`${baseURL}/api/admin/scheduled-invoices/execute`, {
      method: 'POST'
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      console.log('   ✅ Scheduled Invoice Execution: Success');
      console.log(`      📊 Processed: ${data.results.length} invoices`);
      testResults.passed++;
    } else {
      console.log(`   ❌ Scheduled Invoice Execution: ${data.error || 'Unknown error'}`);
      testResults.failed++;
      testResults.errors.push(`Scheduled Invoice Execution: ${data.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.log(`   ❌ Scheduled Invoice Execution: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`Scheduled Invoice Execution: ${error.message}`);
  }

  // Summary
  console.log('\n📊 API TEST SUMMARY:');
  console.log(`   ✅ Passed: ${testResults.passed}`);
  console.log(`   ❌ Failed: ${testResults.failed}`);
  console.log(`   📊 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ ERRORS FOUND:');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  } else {
    console.log('\n🎉 ALL API TESTS PASSED!');
  }

  return testResults;
}

testAllAPIs();
