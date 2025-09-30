import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
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

async function setupAllUsers() {
  console.log('🚀 Final setup for all demo users...\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const results = []

  for (const user of demoUsers) {
    try {
      console.log(`📝 Processing ${user.role.toUpperCase()}: ${user.email}`)
      
      let userId = null
      let action = ''
      
      // Try to get user by signing in
      try {
        const signInResult = await signInWithEmailAndPassword(auth, user.email, user.password)
        userId = signInResult.user.uid
        action = 'Found existing'
        console.log(`✅ Found existing user: ${userId}`)
      } catch (signInError) {
        // If sign in fails, try to create
        if (signInError.code === 'auth/wrong-password' || signInError.code === 'auth/invalid-credential') {
          console.log(`⚠️  User exists but password doesn't match`)
          console.log(`   Attempting to use existing user anyway...`)
          // We can't get the UID without the correct password
          // Skip this user
          results.push({
            email: user.email,
            role: user.role,
            status: 'FAILED',
            reason: 'Password mismatch - please reset in Firebase Console'
          })
          console.log(`❌ Cannot proceed without correct password\n`)
          continue
        } else if (signInError.code === 'auth/user-not-found') {
          // User doesn't exist, create it
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password)
            userId = userCredential.user.uid
            action = 'Created new'
            console.log(`✅ Created new user: ${userId}`)
          } catch (createError) {
            console.error(`❌ Failed to create user:`, createError.message)
            results.push({
              email: user.email,
              role: user.role,
              status: 'FAILED',
              reason: createError.message
            })
            console.log('')
            continue
          }
        } else {
          console.error(`❌ Unexpected error:`, signInError.message)
          results.push({
            email: user.email,
            role: user.role,
            status: 'FAILED',
            reason: signInError.message
          })
          console.log('')
          continue
        }
      }

      if (!userId) {
        console.log(`❌ Could not get user ID\n`)
        continue
      }

      // Create/Update profiles
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
      console.log(`✅ Updated 'users' collection`)

      // Role-specific collections
      if (user.role === 'client') {
        await setDoc(doc(db, 'clients', userId), {
          userId: userId,
          ...userProfile
        }, { merge: true })
        console.log(`✅ Updated 'clients' collection`)
      } else if (user.role === 'subcontractor') {
        await setDoc(doc(db, 'subcontractors', userId), {
          userId: userId,
          ...userProfile
        }, { merge: true })
        console.log(`✅ Updated 'subcontractors' collection`)
      }

      results.push({
        email: user.email,
        role: user.role,
        status: 'SUCCESS',
        uid: userId,
        action: action
      })

      console.log(`✅ ${user.role.toUpperCase()} setup complete!\n`)

    } catch (error) {
      console.error(`❌ Error with ${user.role}:`, error.message)
      results.push({
        email: user.email,
        role: user.role,
        status: 'FAILED',
        reason: error.message
      })
      console.log('')
    }
  }

  // Sign out
  try {
    await auth.signOut()
  } catch (e) {
    // Ignore sign out errors
  }

  // Print summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 SETUP SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  results.forEach(result => {
    const icon = result.status === 'SUCCESS' ? '✅' : '❌'
    console.log(`${icon} ${result.role.toUpperCase().padEnd(15)} - ${result.status}`)
    if (result.status === 'SUCCESS') {
      console.log(`   Email: ${result.email}`)
      console.log(`   UID: ${result.uid}`)
      console.log(`   Action: ${result.action}`)
    } else {
      console.log(`   Email: ${result.email}`)
      console.log(`   Reason: ${result.reason}`)
    }
    console.log('')
  })

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔐 LOGIN CREDENTIALS')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const successfulUsers = results.filter(r => r.status === 'SUCCESS')
  if (successfulUsers.length > 0) {
    successfulUsers.forEach(user => {
      console.log(`${user.role.toUpperCase()}:`)
      console.log(`  Email: ${user.email}`)
      console.log(`  Password: demo123`)
      console.log('')
    })
  }

  if (results.some(r => r.status === 'FAILED')) {
    console.log('⚠️  SOME USERS FAILED TO SET UP')
    console.log('Please check Firebase Console and fix issues manually')
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✨ Login at: http://localhost:3000/portal-login')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  process.exit(0)
}

setupAllUsers().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
