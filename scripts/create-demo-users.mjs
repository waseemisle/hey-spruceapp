// Create Demo Users in Firebase Authentication
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
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

async function createDemoUsers() {
  console.log('🚀 Creating demo users in Firebase...')
  
  for (const userData of demoUsers) {
    try {
      console.log(`\n📝 Creating ${userData.role} user: ${userData.email}`)
      
      // Try to create the user
      const userCredential = await createUserWithEmailAndPassword(auth, userData.email, userData.password)
      const user = userCredential.user
      
      console.log(`✅ Created user: ${user.uid}`)
      
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
      
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        console.log(`⚠️  User ${userData.email} already exists. Updating profile...`)
        
        // Try to sign in to get the existing user ID
        try {
          const userCredential = await signInWithEmailAndPassword(auth, userData.email, userData.password)
          const user = userCredential.user
          
          // Update the profile
          const userProfile = {
            email: userData.email,
            fullName: userData.fullName,
            role: userData.role,
            updatedAt: new Date().toISOString()
          }
          
          await setDoc(doc(db, 'users', user.uid), userProfile, { merge: true })
          console.log(`✅ Updated profile for ${userData.role} user`)
          
        } catch (signInError) {
          console.error(`❌ Error signing in to existing user: ${signInError.message}`)
        }
      } else {
        console.error(`❌ Error creating ${userData.role} user:`, error.message)
      }
    }
  }
  
  console.log('\n🎉 Demo users setup completed!')
  console.log('\n📋 Demo credentials:')
  demoUsers.forEach(user => {
    console.log(`   ${user.role.toUpperCase()}: ${user.email} / demo123`)
  })
  
  console.log('\n🧪 Testing login with demo credentials...')
  
  // Test login with each user
  for (const userData of demoUsers) {
    try {
      await signInWithEmailAndPassword(auth, userData.email, userData.password)
      console.log(`✅ ${userData.role} login successful`)
    } catch (error) {
      console.error(`❌ ${userData.role} login failed:`, error.message)
    }
  }
  
  process.exit(0)
}

createDemoUsers().catch(console.error)
