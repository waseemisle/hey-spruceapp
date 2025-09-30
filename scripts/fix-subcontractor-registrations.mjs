import firebase from 'firebase/compat/app'
import 'firebase/compat/auth'
import 'firebase/compat/firestore'

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8",
  authDomain: "heyspruceappv2.firebaseapp.com",
  projectId: "heyspruceappv2",
  storageBucket: "heyspruceappv2.firebasestorage.app",
  messagingSenderId: "198738285054",
  appId: "1:198738285054:web:6878291b080771623a70af",
  measurementId: "G-82NKE8271G"
}

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig)
}
const db = firebase.firestore()

async function createSubcontractorRegistrations() {
  try {
    console.log('🔧 Creating subcontractor registrations for test subcontractors...')
    
    // Get all test subcontractors from the subcontractors collection
    const subcontractorsSnapshot = await db.collection('subcontractors').get()
    const testSubcontractors = subcontractorsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(sub => sub.email.startsWith('test.sub.'))

    console.log(`Found ${testSubcontractors.length} test subcontractors`)

    for (const sub of testSubcontractors) {
      // Create subcontractor registration record
      const registrationData = {
        email: sub.email,
        fullName: sub.fullName,
        phone: sub.phone,
        title: sub.title,
        categoryId: sub.categoryId,
        categoryName: sub.categoryName,
        skills: sub.skills,
        experience: sub.experience,
        hourlyRate: sub.hourlyRate,
        address: sub.address,
        businessInfo: sub.businessInfo,
        references: sub.references,
        status: 'approved', // Pre-approve all test subcontractors
        submittedAt: sub.createdAt,
        approvedAt: sub.approvedAt,
        approvedBy: sub.approvedBy,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt
      }

      // Check if registration already exists
      const existingReg = await db.collection('subcontractor_registrations')
        .where('email', '==', sub.email)
        .get()

      if (existingReg.empty) {
        // Create the registration record
        await db.collection('subcontractor_registrations').add(registrationData)
        console.log(`✅ Created registration for: ${sub.email} (${sub.categoryName})`)
      } else {
        console.log(`⏭️ Registration already exists for: ${sub.email}`)
      }
    }

    console.log('\n🎉 Subcontractor registrations created successfully!')
    console.log('Test subcontractors should now be able to login properly.')

  } catch (error) {
    console.error('❌ Error creating subcontractor registrations:', error)
  }
}

// Run the script
createSubcontractorRegistrations()
