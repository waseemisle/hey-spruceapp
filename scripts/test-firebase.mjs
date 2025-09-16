// Firebase Connection Test Script
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8",
  authDomain: "heyspruceappv2.firebaseapp.com",
  projectId: "heyspruceappv2",
  storageBucket: "heyspruceappv2.firebasestorage.app",
  messagingSenderId: "198738285054",
  appId: "1:198738285054:web:6878291b080771623a70af",
  measurementId: "G-82NKE8271G"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

async function testFirebaseConnection() {
  console.log('🔍 Testing Firebase connection...')
  console.log('📋 Project ID:', firebaseConfig.projectId)
  console.log('🔑 Auth Domain:', firebaseConfig.authDomain)
  
  try {
    // Test with a non-existent user to see the exact error
    console.log('\n🧪 Testing with non-existent user...')
    await signInWithEmailAndPassword(auth, 'test@example.com', 'test123')
  } catch (error) {
    console.log('✅ Firebase is connected! Error details:')
    console.log('   Code:', error.code)
    console.log('   Message:', error.message)
    
    if (error.code === 'auth/user-not-found') {
      console.log('   ✅ This is expected - user does not exist')
    } else if (error.code === 'auth/invalid-credential') {
      console.log('   ⚠️  Invalid credential - check if Email/Password auth is enabled')
    } else if (error.code === 'auth/invalid-api-key') {
      console.log('   ❌ Invalid API key - check Firebase config')
    } else if (error.code === 'auth/operation-not-allowed') {
      console.log('   ❌ Email/Password authentication is not enabled in Firebase Console')
    }
  }
  
  // Test creating a user (this will fail if Email/Password is disabled)
  try {
    console.log('\n🧪 Testing user creation...')
    await createUserWithEmailAndPassword(auth, 'test-create@example.com', 'test123')
    console.log('✅ User creation works - Email/Password auth is enabled')
  } catch (error) {
    console.log('❌ User creation failed:')
    console.log('   Code:', error.code)
    console.log('   Message:', error.message)
    
    if (error.code === 'auth/operation-not-allowed') {
      console.log('\n🚨 SOLUTION: Enable Email/Password authentication in Firebase Console')
      console.log('   1. Go to: https://console.firebase.google.com/project/heyspruceappv2/authentication/sign-in-method')
      console.log('   2. Click on "Email/Password"')
      console.log('   3. Enable "Email/Password" provider')
      console.log('   4. Click "Save"')
    }
  }
  
  process.exit(0)
}

testFirebaseConnection().catch(console.error)
