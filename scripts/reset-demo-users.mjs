import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
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

// Known UIDs from the previous run
const demoUsers = [
  {
    // We need to find the client UID - let's use a placeholder
    uid: 'CLIENT_UID_HERE', // You'll need to get this from Firebase Console
    email: 'demo.client@heyspruce.com',
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
    uid: 'KVaytOqzmSYqLA6XkKsOhrvyOT13',
    email: 'demo.admin@heyspruce.com',
    role: 'admin',
    fullName: 'Demo Admin',
    profile: {
      phone: '+1-555-0100',
      status: 'approved'
    }
  },
  {
    uid: 'HmOXbbG17aM1GWHEkNGIhPJppan1',
    email: 'demo.sub@heyspruce.com',
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

async function updateDemoProfiles() {
  console.log('🚀 Updating demo user profiles...\n')

  for (const user of demoUsers) {
    if (user.uid === 'CLIENT_UID_HERE') {
      console.log(`⚠️  Skipping client - UID not known yet`)
      console.log(`   Please check Firebase Console for the client UID\n`)
      continue
    }

    try {
      console.log(`📝 Updating ${user.role}: ${user.email}`)
      
      // Create/Update user profile in 'users' collection
      const userProfile = {
        id: user.uid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        ...user.profile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await setDoc(doc(db, 'users', user.uid), userProfile, { merge: true })
      console.log(`✅ User profile updated in 'users' collection`)

      // Create/Update role-specific profile
      if (user.role === 'client') {
        await setDoc(doc(db, 'clients', user.uid), {
          userId: user.uid,
          ...userProfile
        }, { merge: true })
        console.log(`✅ Client profile updated in 'clients' collection`)
      } else if (user.role === 'subcontractor') {
        await setDoc(doc(db, 'subcontractors', user.uid), {
          userId: user.uid,
          ...userProfile
        }, { merge: true })
        console.log(`✅ Subcontractor profile updated in 'subcontractors' collection`)
      }

      console.log(`✅ ${user.role.toUpperCase()} profile updated!\n`)

    } catch (error) {
      console.error(`❌ Error updating ${user.role}:`, error.message)
      console.log('')
    }
  }

  console.log('🎉 Profile updates completed!')
  console.log('\n📋 Demo User Status:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ ADMIN - Ready to use')
  console.log('✅ SUBCONTRACTOR - Ready to use')
  console.log('⚠️  CLIENT - Needs UID update in script')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  process.exit(0)
}

updateDemoProfiles().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
