import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import * as readline from 'readline'

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(query) {
  return new Promise(resolve => rl.question(query, resolve))
}

async function fixClientUser() {
  console.log('🔧 Client User Password Fix\n')
  console.log('The client user (demo.client@heyspruce.com) exists but has a different password.')
  console.log('We need the CURRENT password to access and update the profile.\n')
  
  const email = 'demo.client@heyspruce.com'
  
  console.log('Options:')
  console.log('1. Enter the current password to update the profile')
  console.log('2. Cancel and reset password in Firebase Console\n')
  
  const choice = await question('Enter choice (1 or 2): ')
  
  if (choice === '2') {
    console.log('\n📌 To reset the password in Firebase Console:')
    console.log('1. Go to: https://console.firebase.google.com')
    console.log('2. Select your project: heyspruceappv2')
    console.log('3. Go to Authentication > Users')
    console.log('4. Find: demo.client@heyspruce.com')
    console.log('5. Click the three dots (...) > Reset password')
    console.log('6. Set password to: demo123')
    console.log('7. Run this script again with option 1\n')
    rl.close()
    process.exit(0)
  }
  
  const password = await question('\nEnter current password for demo.client@heyspruce.com: ')
  
  try {
    console.log('\n🔐 Attempting to sign in...')
    const signInResult = await signInWithEmailAndPassword(auth, email, password)
    const userId = signInResult.user.uid
    
    console.log(`✅ Sign in successful! UID: ${userId}`)
    
    // Create client profile
    const userProfile = {
      id: userId,
      email: email,
      fullName: 'Demo Client',
      role: 'client',
      companyName: 'Demo Property Management',
      phone: '+1-555-0101',
      businessType: 'Commercial',
      numberOfProperties: 10,
      estimatedMonthlySpend: '$5000-$10000',
      preferredServices: ['HVAC', 'Plumbing', 'Electrical', 'Landscaping'],
      status: 'approved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    await setDoc(doc(db, 'users', userId), userProfile, { merge: true })
    console.log(`✅ Updated 'users' collection`)
    
    await setDoc(doc(db, 'clients', userId), {
      userId: userId,
      ...userProfile
    }, { merge: true })
    console.log(`✅ Updated 'clients' collection`)
    
    console.log('\n🎉 Client user profile created successfully!')
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ All three demo users are now ready!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n📋 Login Credentials:')
    console.log('\n👤 CLIENT:')
    console.log('   Email: demo.client@heyspruce.com')
    console.log('   Password: ' + password)
    console.log('\n👨‍💼 ADMIN:')
    console.log('   Email: demo.admin@heyspruce.com')
    console.log('   Password: demo123')
    console.log('\n🔧 SUBCONTRACTOR:')
    console.log('   Email: demo.sub@heyspruce.com')
    console.log('   Password: demo123')
    console.log('\n✨ Login at: http://localhost:3000/portal-login')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      console.log('\n⚠️  Wrong password. Please try again or reset in Firebase Console.')
    }
  }
  
  rl.close()
  process.exit(0)
}

fixClientUser()
