import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';

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

async function testAuthentication() {
  console.log('🔐 COMPREHENSIVE AUTHENTICATION TESTING\n');
  
  const testResults = {
    admin: { login: false, logout: false },
    client: { login: false, logout: false },
    subcontractor: { login: false, logout: false },
    errors: []
  };

  // Test 1: Admin Authentication
  console.log('1️⃣ Testing Admin Authentication...');
  try {
    const adminCredential = await signInWithEmailAndPassword(auth, 'demo.admin@heyspruce.com', 'demo123');
    console.log('   ✅ Admin login successful');
    console.log(`   📧 Email: ${adminCredential.user.email}`);
    console.log(`   🆔 UID: ${adminCredential.user.uid}`);
    testResults.admin.login = true;
    
    await signOut(auth);
    console.log('   ✅ Admin logout successful');
    testResults.admin.logout = true;
  } catch (error) {
    console.log(`   ❌ Admin login failed: ${error.message}`);
    testResults.errors.push(`Admin login: ${error.message}`);
  }

  // Test 2: Client Authentication
  console.log('\n2️⃣ Testing Client Authentication...');
  try {
    const clientCredential = await signInWithEmailAndPassword(auth, 'waseemisle@gmail.com', 'waseemisle@gmail.com');
    console.log('   ✅ Client login successful');
    console.log(`   📧 Email: ${clientCredential.user.email}`);
    console.log(`   🆔 UID: ${clientCredential.user.uid}`);
    testResults.client.login = true;
    
    await signOut(auth);
    console.log('   ✅ Client logout successful');
    testResults.client.logout = true;
  } catch (error) {
    console.log(`   ❌ Client login failed: ${error.message}`);
    testResults.errors.push(`Client login: ${error.message}`);
  }

  // Test 3: Subcontractor Authentication
  console.log('\n3️⃣ Testing Subcontractor Authentication...');
  try {
    const subcontractorCredential = await signInWithEmailAndPassword(auth, 'wasimisle@gmail.com', 'wasimisle@gmail.com');
    console.log('   ✅ Subcontractor login successful');
    console.log(`   📧 Email: ${subcontractorCredential.user.email}`);
    console.log(`   🆔 UID: ${subcontractorCredential.user.uid}`);
    testResults.subcontractor.login = true;
    
    await signOut(auth);
    console.log('   ✅ Subcontractor logout successful');
    testResults.subcontractor.logout = true;
  } catch (error) {
    console.log(`   ❌ Subcontractor login failed: ${error.message}`);
    testResults.errors.push(`Subcontractor login: ${error.message}`);
  }

  // Test 4: Invalid Credentials
  console.log('\n4️⃣ Testing Invalid Credentials...');
  try {
    await signInWithEmailAndPassword(auth, 'invalid@email.com', 'wrongpassword');
    console.log('   ❌ Invalid login should have failed');
  } catch (error) {
    console.log('   ✅ Invalid credentials properly rejected');
    console.log(`   📝 Error: ${error.message}`);
  }

  // Summary
  console.log('\n📊 AUTHENTICATION TEST SUMMARY:');
  console.log(`   Admin Login: ${testResults.admin.login ? '✅' : '❌'}`);
  console.log(`   Admin Logout: ${testResults.admin.logout ? '✅' : '❌'}`);
  console.log(`   Client Login: ${testResults.client.login ? '✅' : '❌'}`);
  console.log(`   Client Logout: ${testResults.client.logout ? '✅' : '❌'}`);
  console.log(`   Subcontractor Login: ${testResults.subcontractor.login ? '✅' : '❌'}`);
  console.log(`   Subcontractor Logout: ${testResults.subcontractor.logout ? '✅' : '❌'}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ ERRORS FOUND:');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  } else {
    console.log('\n🎉 ALL AUTHENTICATION TESTS PASSED!');
  }

  return testResults;
}

testAuthentication();
