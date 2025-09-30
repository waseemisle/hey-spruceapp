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

async function createClientRegistrations() {
  try {
    console.log('🔧 Creating client registrations for test clients...')
    
    // Get all test clients from the clients collection
    const clientsSnapshot = await db.collection('clients').get()
    const testClients = clientsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(client => client.email.startsWith('test.client.'))

    console.log(`Found ${testClients.length} test clients`)

    for (const client of testClients) {
      // Create client registration record
      const registrationData = {
        email: client.email,
        fullName: client.fullName,
        phone: client.phone,
        companyName: client.companyName,
        businessType: client.businessType,
        address: client.address,
        status: 'approved', // Pre-approve all test clients
        submittedAt: client.createdAt,
        approvedAt: client.approvedAt,
        approvedBy: client.approvedBy,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt
      }

      // Check if registration already exists
      const existingReg = await db.collection('client_registrations')
        .where('email', '==', client.email)
        .get()

      if (existingReg.empty) {
        // Create the registration record
        await db.collection('client_registrations').add(registrationData)
        console.log(`✅ Created registration for: ${client.email}`)
      } else {
        console.log(`⏭️ Registration already exists for: ${client.email}`)
      }
    }

    console.log('\n🎉 Client registrations created successfully!')
    console.log('Test clients should now be able to login without the "No registration found" error.')

  } catch (error) {
    console.error('❌ Error creating client registrations:', error)
  }
}

// Run the script
createClientRegistrations()
