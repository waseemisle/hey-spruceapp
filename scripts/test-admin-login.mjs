// Test Admin Login
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, getDoc } from 'firebase/firestore'

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
const db = getFirestore(app)

async function testAdminLogin() {
  console.log('🧪 Testing admin login...')
  
  try {
    // Test Firebase Auth login
    console.log('1. Testing Firebase Auth login...')
    const userCredential = await signInWithEmailAndPassword(auth, 'demo.admin@heyspruce.com', 'demo123')
    console.log('✅ Firebase Auth login successful')
    console.log('   User ID:', userCredential.user.uid)
    console.log('   Email:', userCredential.user.email)
    
    // Test Firestore profile lookup
    console.log('2. Testing Firestore profile lookup...')
    const profileRef = doc(db, 'users', userCredential.user.uid)
    const profileDoc = await getDoc(profileRef)
    
    if (profileDoc.exists()) {
      console.log('✅ User profile found in Firestore')
      console.log('   Profile data:', profileDoc.data())
    } else {
      console.log('❌ User profile NOT found in Firestore')
      console.log('   This might be the issue!')
    }
    
    // Test role check
    if (profileDoc.exists()) {
      const profileData = profileDoc.data()
      console.log('3. Testing role check...')
      console.log('   User role:', profileData.role)
      
      if (profileData.role === 'admin') {
        console.log('✅ User has admin role')
      } else {
        console.log('❌ User does NOT have admin role')
        console.log('   Expected: admin, Got:', profileData.role)
      }
    }
    
  } catch (error) {
    console.error('❌ Login test failed:', error.message)
    console.error('   Error code:', error.code)
  }
}

testAdminLogin()
