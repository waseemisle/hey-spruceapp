import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

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
  try {
    console.log('🧪 Testing Authentication System...\n');
    
    // Test admin login
    console.log('1. Testing admin login...');
    try {
      const adminCredential = await signInWithEmailAndPassword(auth, 'demo.admin@heyspruce.com', 'demo123');
      console.log('✅ Admin login successful');
      console.log(`   User ID: ${adminCredential.user.uid}`);
      console.log(`   Email: ${adminCredential.user.email}`);
      
      // Sign out
      await signOut(auth);
      console.log('✅ Admin logout successful\n');
    } catch (error) {
      console.log(`❌ Admin login failed: ${error.message}\n`);
    }
    
    // Test client login
    console.log('2. Testing client login...');
    try {
      const clientCredential = await signInWithEmailAndPassword(auth, 'waseemisle@gmail.com', 'waseemisle@gmail.com');
      console.log('✅ Client login successful');
      console.log(`   User ID: ${clientCredential.user.uid}`);
      console.log(`   Email: ${clientCredential.user.email}`);
      
      // Sign out
      await signOut(auth);
      console.log('✅ Client logout successful\n');
    } catch (error) {
      console.log(`❌ Client login failed: ${error.message}\n`);
    }
    
    // Test subcontractor login
    console.log('3. Testing subcontractor login...');
    try {
      const subcontractorCredential = await signInWithEmailAndPassword(auth, 'wasimisle@gmail.com', 'wasimisle@gmail.com');
      console.log('✅ Subcontractor login successful');
      console.log(`   User ID: ${subcontractorCredential.user.uid}`);
      console.log(`   Email: ${subcontractorCredential.user.email}`);
      
      // Sign out
      await signOut(auth);
      console.log('✅ Subcontractor logout successful\n');
    } catch (error) {
      console.log(`❌ Subcontractor login failed: ${error.message}\n`);
    }
    
    console.log('🎉 Authentication Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

testAuthentication();
