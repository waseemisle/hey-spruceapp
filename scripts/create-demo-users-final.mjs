import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, collection } from 'firebase/firestore'

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
      categoryId: 'hvac', // This should match a category in your system
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

async function createDemoUsers() {
  console.log('🚀 Starting demo user creation...\n')

  for (const user of demoUsers) {
    try {
      console.log(`📝 Creating ${user.role}: ${user.email}`)
      
      // Create Firebase Auth user
      let firebaseUser
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password)
        firebaseUser = userCredential.user
        console.log(`✅ Firebase Auth user created: ${firebaseUser.uid}`)
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          console.log(`⚠️  User already exists in Firebase Auth: ${user.email}`)
          console.log(`   Skipping to profile creation...`)
          // Try to get the existing user
          continue
        } else {
          throw authError
        }
      }

      // Create user profile in 'users' collection
      const userProfile = {
        id: firebaseUser.uid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        ...user.profile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await setDoc(doc(db, 'users', firebaseUser.uid), userProfile)
      console.log(`✅ User profile created in 'users' collection`)

      // Create role-specific profile
      if (user.role === 'client') {
        await setDoc(doc(db, 'clients', firebaseUser.uid), {
          userId: firebaseUser.uid,
          ...userProfile
        })
        console.log(`✅ Client profile created in 'clients' collection`)
      } else if (user.role === 'subcontractor') {
        await setDoc(doc(db, 'subcontractors', firebaseUser.uid), {
          userId: firebaseUser.uid,
          ...userProfile
        })
        console.log(`✅ Subcontractor profile created in 'subcontractors' collection`)
      }

      console.log(`✅ ${user.role.toUpperCase()} account setup complete!\n`)

    } catch (error) {
      console.error(`❌ Error creating ${user.role}:`, error.message)
      console.error(`   Details:`, error)
      console.log('')
    }
  }

  console.log('🎉 Demo user creation completed!')
  console.log('\n📋 Login Credentials:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('👤 CLIENT:')
  console.log('   Email: demo.client@heyspruce.com')
  console.log('   Password: demo123')
  console.log('')
  console.log('👨‍💼 ADMIN:')
  console.log('   Email: demo.admin@heyspruce.com')
  console.log('   Password: demo123')
  console.log('')
  console.log('🔧 SUBCONTRACTOR:')
  console.log('   Email: demo.sub@heyspruce.com')
  console.log('   Password: demo123')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n✨ You can now log in to the application!')
  
  process.exit(0)
}

createDemoUsers().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
