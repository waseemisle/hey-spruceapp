// Firebase Setup Script for Demo Users
// Run this script after creating users in Firebase Authentication Console

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'

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

const demoUsers = [
  {
    email: 'demo.client@heyspruce.com',
    password: 'demo123',
    role: 'client',
    fullName: 'Demo Client User'
  },
  {
    email: 'demo.admin@heyspruce.com',
    password: 'demo123',
    role: 'admin',
    fullName: 'Demo Admin User'
  },
  {
    email: 'demo.sub@heyspruce.com',
    password: 'demo123',
    role: 'subcontractor',
    fullName: 'Demo Subcontractor User'
  }
]

async function setupDemoUsers() {
  console.log('🚀 Starting demo users setup...')
  
  for (const userData of demoUsers) {
    try {
      console.log(`\n📝 Setting up ${userData.role} user: ${userData.email}`)
      
      // Sign in to get the user ID
      const userCredential = await signInWithEmailAndPassword(auth, userData.email, userData.password)
      const user = userCredential.user
      
      console.log(`✅ Authenticated user: ${user.uid}`)
      
      // Create user profile in Firestore
      const userProfile = {
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await setDoc(doc(db, 'users', user.uid), userProfile)
      console.log(`✅ Created profile for ${userData.role} user`)
      
      // Sign out before next iteration
      await signOut(auth)
      
    } catch (error) {
      console.error(`❌ Error setting up ${userData.role} user:`, error.message)
      
      if (error.code === 'auth/user-not-found') {
        console.log(`⚠️  User ${userData.email} not found. Please create this user in Firebase Console first.`)
      } else if (error.code === 'auth/wrong-password') {
        console.log(`⚠️  Wrong password for ${userData.email}. Please check the password in Firebase Console.`)
      }
    }
  }
  
  console.log('\n🎉 Demo users setup completed!')
  console.log('\n📋 Demo credentials:')
  demoUsers.forEach(user => {
    console.log(`   ${user.role.toUpperCase()}: ${user.email} / demo123`)
  })
  
  process.exit(0)
}

// Run the setup
setupDemoUsers().catch(console.error)
