import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth'
import { getFirestore, doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'

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

async function createClientUser() {
  console.log('🚀 Creating client demo user...\n')
  
  const email = 'demo.client@heyspruce.com'
  const password = 'demo123'
  
  try {
    // Check if email is already in use
    console.log(`📧 Checking if ${email} exists...`)
    const signInMethods = await fetchSignInMethodsForEmail(auth, email)
    
    if (signInMethods.length > 0) {
      console.log(`⚠️  User already exists in Firebase Auth`)
      console.log(`   This user needs to be reset in Firebase Console`)
      console.log(`   OR you can use a different email`)
      console.log(`\n📌 Steps to reset in Firebase Console:`)
      console.log(`   1. Go to Firebase Console > Authentication`)
      console.log(`   2. Find demo.client@heyspruce.com`)
      console.log(`   3. Delete the user`)
      console.log(`   4. Run this script again`)
      process.exit(1)
    }
    
    // Create new user
    console.log(`✅ Email is available, creating user...`)
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const userId = userCredential.user.uid
    
    console.log(`✅ Firebase Auth user created: ${userId}`)
    
    // Create user profile
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
    
    await setDoc(doc(db, 'users', userId), userProfile)
    console.log(`✅ User profile created in 'users' collection`)
    
    await setDoc(doc(db, 'clients', userId), {
      userId: userId,
      ...userProfile
    })
    console.log(`✅ Client profile created in 'clients' collection`)
    
    console.log('\n🎉 Client demo user created successfully!')
    console.log('\n📋 Login Credentials:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('👤 CLIENT:')
    console.log('   Email: demo.client@heyspruce.com')
    console.log('   Password: demo123')
    console.log('   Role: client')
    console.log('   UID: ' + userId)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n✨ You can now log in at /portal-login')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.code) {
      console.error('   Error code:', error.code)
    }
    process.exit(1)
  }
  
  process.exit(0)
}

createClientUser()
