import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
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
const auth = getAuth(app);
const db = getFirestore(app);

async function testDemoAccounts() {
  console.log('🧪 TESTING DEMO ACCOUNTS\n');
  
  const demoAccounts = [
    { email: 'demo.client@heyspruce.com', password: 'demo123', role: 'Client' },
    { email: 'demo.admin@heyspruce.com', password: 'demo123', role: 'Admin' },
    { email: 'demo.sub@heyspruce.com', password: 'demo123', role: 'Subcontractor' }
  ];

  const results = {
    successful: 0,
    failed: 0,
    errors: []
  };

  for (const account of demoAccounts) {
    try {
      console.log(`🔍 Testing ${account.role} login: ${account.email}`);
      
      // Test login
      const userCredential = await signInWithEmailAndPassword(auth, account.email, account.password);
      console.log(`   ✅ Login successful`);
      console.log(`   🆔 UID: ${userCredential.user.uid}`);
      console.log(`   📧 Email: ${userCredential.user.email}`);
      
      // Test logout
      await signOut(auth);
      console.log(`   ✅ Logout successful`);
      
      results.successful++;
      console.log(`   🎉 ${account.role} account working perfectly!\n`);
      
    } catch (error) {
      console.log(`   ❌ ${account.role} login failed: ${error.message}`);
      results.failed++;
      results.errors.push(`${account.role}: ${error.message}`);
      console.log('');
    }
  }

  // Test API access for each role
  console.log('🌐 Testing API Access...\n');
  
  // Test client API access
  try {
    console.log('🔍 Testing Client API access...');
    const clientResponse = await fetch('http://localhost:3000/api/workorders?userId=test&role=client');
    const clientData = await clientResponse.json();
    console.log(`   ✅ Client API: ${clientResponse.status} - ${clientData.success ? 'Success' : 'API Error'}`);
  } catch (error) {
    console.log(`   ❌ Client API test failed: ${error.message}`);
  }

  // Test admin API access
  try {
    console.log('🔍 Testing Admin API access...');
    const adminResponse = await fetch('http://localhost:3000/api/admin/subcontractors');
    const adminData = await adminResponse.json();
    console.log(`   ✅ Admin API: ${adminResponse.status} - ${adminData.success ? 'Success' : 'API Error'}`);
  } catch (error) {
    console.log(`   ❌ Admin API test failed: ${error.message}`);
  }

  // Test subcontractor API access
  try {
    console.log('🔍 Testing Subcontractor API access...');
    const subResponse = await fetch('http://localhost:3000/api/workorders?userId=test&role=subcontractor');
    const subData = await subResponse.json();
    console.log(`   ✅ Subcontractor API: ${subResponse.status} - ${subData.success ? 'Success' : 'API Error'}`);
  } catch (error) {
    console.log(`   ❌ Subcontractor API test failed: ${error.message}`);
  }

  // Summary
  console.log('\n📊 DEMO ACCOUNTS TEST SUMMARY:');
  console.log(`   ✅ Successful Logins: ${results.successful}/3`);
  console.log(`   ❌ Failed Logins: ${results.failed}/3`);
  console.log(`   📊 Success Rate: ${((results.successful / 3) * 100).toFixed(1)}%`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach(error => console.log(`   - ${error}`));
  } else {
    console.log('\n🎉 ALL DEMO ACCOUNTS WORKING PERFECTLY!');
  }
  
  console.log('\n📝 READY FOR TESTING:');
  console.log('   🌐 Application URL: http://localhost:3000');
  console.log('   👤 Client: demo.client@heyspruce.com / demo123');
  console.log('   👨‍💼 Admin: demo.admin@heyspruce.com / demo123');
  console.log('   🔧 Subcontractor: demo.sub@heyspruce.com / demo123');
  
  return results;
}

testDemoAccounts();
