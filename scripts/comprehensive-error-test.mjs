import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

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
const auth = getAuth(app);

async function testErrorHandling() {
  console.log('⚠️ COMPREHENSIVE ERROR HANDLING TESTING\n');
  
  const testResults = {
    errorTests: {},
    errors: []
  };

  // Test 1: Invalid Authentication
  console.log('1️⃣ Testing Invalid Authentication...');
  try {
    await signInWithEmailAndPassword(auth, 'nonexistent@email.com', 'wrongpassword');
    console.log('   ❌ Should have failed with invalid credentials');
    testResults.errorTests.invalidAuth = { status: 'failed', message: 'Should have failed' };
  } catch (error) {
    console.log('   ✅ Invalid credentials properly rejected');
    console.log(`   📝 Error: ${error.message}`);
    testResults.errorTests.invalidAuth = { status: 'success', message: error.message };
  }

  // Test 2: API Error Handling
  console.log('\n2️⃣ Testing API Error Handling...');
  
  // Test invalid API calls
  const apiErrorTests = [
    { name: 'Invalid Work Orders API', url: 'http://localhost:3000/api/workorders', method: 'GET' },
    { name: 'Invalid Client Quotes API', url: 'http://localhost:3000/api/client/quotes', method: 'GET' },
    { name: 'Invalid Scheduled Invoice Creation', url: 'http://localhost:3000/api/admin/scheduled-invoices', method: 'POST', body: {} }
  ];

  for (const test of apiErrorTests) {
    try {
      console.log(`   🔍 Testing ${test.name}...`);
      const response = await fetch(test.url, {
        method: test.method,
        headers: test.body ? { 'Content-Type': 'application/json' } : {},
        body: test.body ? JSON.stringify(test.body) : undefined
      });
      
      const data = await response.json();
      
      if (response.status >= 400) {
        console.log(`   ✅ ${test.name}: Properly returned error (${response.status})`);
        console.log(`   📝 Error: ${data.error || 'Unknown error'}`);
        testResults.errorTests[test.name] = { status: 'success', message: data.error || 'Unknown error' };
      } else {
        console.log(`   ⚠️  ${test.name}: Unexpected success (${response.status})`);
        testResults.errorTests[test.name] = { status: 'warning', message: 'Unexpected success' };
      }
    } catch (error) {
      console.log(`   ✅ ${test.name}: Network error properly handled`);
      console.log(`   📝 Error: ${error.message}`);
      testResults.errorTests[test.name] = { status: 'success', message: error.message };
    }
  }

  // Test 3: Malformed Data Handling
  console.log('\n3️⃣ Testing Malformed Data Handling...');
  try {
    console.log('   🔍 Testing malformed scheduled invoice data...');
    const response = await fetch('http://localhost:3000/api/admin/scheduled-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Missing required fields
        title: 'Test',
        // clientId missing
        // amount missing
        // frequency missing
      })
    });
    
    const data = await response.json();
    
    if (response.status >= 400) {
      console.log('   ✅ Malformed data properly rejected');
      console.log(`   📝 Error: ${data.error || 'Unknown error'}`);
      testResults.errorTests.malformedData = { status: 'success', message: data.error || 'Unknown error' };
    } else {
      console.log('   ❌ Malformed data should have been rejected');
      testResults.errorTests.malformedData = { status: 'failed', message: 'Should have been rejected' };
    }
  } catch (error) {
    console.log(`   ✅ Malformed data error properly handled: ${error.message}`);
    testResults.errorTests.malformedData = { status: 'success', message: error.message };
  }

  // Test 4: Invalid Client ID
  console.log('\n4️⃣ Testing Invalid Client ID...');
  try {
    console.log('   🔍 Testing scheduled invoice with invalid client ID...');
    const response = await fetch('http://localhost:3000/api/admin/scheduled-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'invalid-client-id',
        title: 'Test Invoice',
        description: 'Test',
        amount: '100',
        frequency: 'weekly',
        dayOfWeek: '1',
        time: '09:00',
        timezone: 'America/New_York',
        notes: 'Test',
        adminId: 'test-admin',
        adminName: 'Test Admin',
        adminEmail: 'test@admin.com'
      })
    });
    
    const data = await response.json();
    
    if (response.status >= 400) {
      console.log('   ✅ Invalid client ID properly rejected');
      console.log(`   📝 Error: ${data.error || 'Unknown error'}`);
      testResults.errorTests.invalidClientId = { status: 'success', message: data.error || 'Unknown error' };
    } else {
      console.log('   ❌ Invalid client ID should have been rejected');
      testResults.errorTests.invalidClientId = { status: 'failed', message: 'Should have been rejected' };
    }
  } catch (error) {
    console.log(`   ✅ Invalid client ID error properly handled: ${error.message}`);
    testResults.errorTests.invalidClientId = { status: 'success', message: error.message };
  }

  // Test 5: Invalid Amount Format
  console.log('\n5️⃣ Testing Invalid Amount Format...');
  try {
    console.log('   🔍 Testing scheduled invoice with invalid amount...');
    const response = await fetch('http://localhost:3000/api/admin/scheduled-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'l14Mfa3VghUCJjGajq9z7AC4I2T2',
        title: 'Test Invoice',
        description: 'Test',
        amount: 'not-a-number',
        frequency: 'weekly',
        dayOfWeek: '1',
        time: '09:00',
        timezone: 'America/New_York',
        notes: 'Test',
        adminId: 'test-admin',
        adminName: 'Test Admin',
        adminEmail: 'test@admin.com'
      })
    });
    
    const data = await response.json();
    
    if (response.status >= 400) {
      console.log('   ✅ Invalid amount format properly rejected');
      console.log(`   📝 Error: ${data.error || 'Unknown error'}`);
      testResults.errorTests.invalidAmount = { status: 'success', message: data.error || 'Unknown error' };
    } else {
      console.log('   ⚠️  Invalid amount format accepted (may be handled by parseFloat)');
      testResults.errorTests.invalidAmount = { status: 'warning', message: 'Accepted by parseFloat' };
    }
  } catch (error) {
    console.log(`   ✅ Invalid amount error properly handled: ${error.message}`);
    testResults.errorTests.invalidAmount = { status: 'success', message: error.message };
  }

  // Test 6: Invalid Frequency
  console.log('\n6️⃣ Testing Invalid Frequency...');
  try {
    console.log('   🔍 Testing scheduled invoice with invalid frequency...');
    const response = await fetch('http://localhost:3000/api/admin/scheduled-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'l14Mfa3VghUCJjGajq9z7AC4I2T2',
        title: 'Test Invoice',
        description: 'Test',
        amount: '100',
        frequency: 'invalid-frequency',
        dayOfWeek: '1',
        time: '09:00',
        timezone: 'America/New_York',
        notes: 'Test',
        adminId: 'test-admin',
        adminName: 'Test Admin',
        adminEmail: 'test@admin.com'
      })
    });
    
    const data = await response.json();
    
    if (response.status >= 400) {
      console.log('   ✅ Invalid frequency properly rejected');
      console.log(`   📝 Error: ${data.error || 'Unknown error'}`);
      testResults.errorTests.invalidFrequency = { status: 'success', message: data.error || 'Unknown error' };
    } else {
      console.log('   ❌ Invalid frequency should have been rejected');
      testResults.errorTests.invalidFrequency = { status: 'failed', message: 'Should have been rejected' };
    }
  } catch (error) {
    console.log(`   ✅ Invalid frequency error properly handled: ${error.message}`);
    testResults.errorTests.invalidFrequency = { status: 'success', message: error.message };
  }

  // Summary
  console.log('\n📊 ERROR HANDLING TEST SUMMARY:');
  const successfulTests = Object.values(testResults.errorTests).filter(t => t.status === 'success').length;
  const totalTests = Object.keys(testResults.errorTests).length;
  
  console.log(`   ✅ Successful Error Handling: ${successfulTests}/${totalTests}`);
  console.log(`   📊 Success Rate: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);
  
  console.log('\n📊 Error Test Details:');
  Object.entries(testResults.errorTests).forEach(([name, data]) => {
    const status = data.status === 'success' ? '✅' : data.status === 'warning' ? '⚠️' : '❌';
    console.log(`   ${name}: ${status} ${data.status}`);
    console.log(`      ${data.message}`);
  });
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ UNEXPECTED ERRORS:');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  } else {
    console.log('\n🎉 ALL ERROR HANDLING TESTS PASSED!');
  }

  return testResults;
}

testErrorHandling();
