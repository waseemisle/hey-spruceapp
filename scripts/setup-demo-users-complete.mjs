import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore'

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
    fullName: 'Demo Client',
    profile: {
      companyName: 'Demo Property Management',
      phone: '+1-555-0101',
      businessType: 'Commercial',
      numberOfProperties: 10,
      estimatedMonthlySpend: '$5000-$10000',
      preferredServices: ['HVAC', 'Plumbing', 'Electrical', 'Landscaping'],
      status: 'approved'
    }
  },
  {
    email: 'demo.admin@heyspruce.com',
    password: 'demo123',
    role: 'admin',
    fullName: 'Demo Admin',
    profile: {
      phone: '+1-555-0100',
      status: 'approved'
    }
  },
  {
    email: 'demo.sub@heyspruce.com',
    password: 'demo123',
    role: 'subcontractor',
    fullName: 'Demo Subcontractor',
    profile: {
      title: 'Licensed HVAC Technician',
      phone: '+1-555-0102',
      categoryId: 'hvac',
      skills: ['HVAC Installation', 'HVAC Repair', 'Air Conditioning', 'Heating Systems'],
      experience: '10+ years',
      hourlyRate: 85,
      availability: 'available',
      status: 'approved',
      address: {
        street: '123 Contractor Ave',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      },
      businessInfo: {
        businessName: 'Demo HVAC Services',
        licenseNumber: 'HVAC-12345',
        insuranceInfo: 'Fully insured - Policy #INS-67890'
      }
    }
  }
]

async function setupDemoUsers() {
  console.log('🚀 Starting demo user setup...\n')

  for (const user of demoUsers) {
    try {
      console.log(`📝 Setting up ${user.role}: ${user.email}`)
      
      let userId = null
      
      // Try to sign in first to get the user ID
      try {
        const signInResult = await signInWithEmailAndPassword(auth, user.email, user.password)
        userId = signInResult.user.uid
        console.log(`✅ Found existing user: ${userId}`)
      } catch (signInError) {
        if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/wrong-password') {
          // User doesn't exist, create it
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password)
            userId = userCredential.user.uid
            console.log(`✅ Created new Firebase Auth user: ${userId}`)
          } catch (createError) {
            if (createError.code === 'auth/email-already-in-use') {
              console.log(`⚠️  User exists but couldn't sign in. Trying admin SDK approach...`)
              // For existing users we can't sign in to, we'll need to get their UID another way
              // For now, skip this user
              console.log(`⚠️  Please reset password for ${user.email} or use Firebase Console to get UID`)
              continue
            } else {
              throw createError
            }
          }
        } else {
          throw signInError
        }
      }

      if (!userId) {
        console.log(`❌ Could not get user ID for ${user.email}`)
        continue
      }

      // Create/Update user profile in 'users' collection
      const userProfile = {
        id: userId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        ...user.profile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await setDoc(doc(db, 'users', userId), userProfile, { merge: true })
      console.log(`✅ User profile created/updated in 'users' collection`)

      // Create/Update role-specific profile
      if (user.role === 'client') {
        await setDoc(doc(db, 'clients', userId), {
          userId: userId,
          ...userProfile
        }, { merge: true })
        console.log(`✅ Client profile created/updated in 'clients' collection`)
      } else if (user.role === 'subcontractor') {
        await setDoc(doc(db, 'subcontractors', userId), {
          userId: userId,
          ...userProfile
        }, { merge: true })
        console.log(`✅ Subcontractor profile created/updated in 'subcontractors' collection`)
      }

      console.log(`✅ ${user.role.toUpperCase()} account setup complete!\n`)

    } catch (error) {
      console.error(`❌ Error setting up ${user.role}:`, error.message)
      if (error.code) {
        console.error(`   Error code: ${error.code}`)
      }
      console.log('')
    }
  }

  // Sign out
  try {
    await auth.signOut()
    console.log('🔓 Signed out\n')
  } catch (error) {
    console.log('⚠️  Sign out warning:', error.message, '\n')
  }

  console.log('🎉 Demo user setup completed!')
  console.log('\n📋 Login Credentials:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('👤 CLIENT:')
  console.log('   Email: demo.client@heyspruce.com')
  console.log('   Password: demo123')
  console.log('   Role: client')
  console.log('')
  console.log('👨‍💼 ADMIN:')
  console.log('   Email: demo.admin@heyspruce.com')
  console.log('   Password: demo123')
  console.log('   Role: admin')
  console.log('')
  console.log('🔧 SUBCONTRACTOR:')
  console.log('   Email: demo.sub@heyspruce.com')
  console.log('   Password: demo123')
  console.log('   Role: subcontractor')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n✨ You can now log in to the application at /portal-login')
  console.log('💡 Select the appropriate portal type before logging in!')
  
  process.exit(0)
}

setupDemoUsers().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
