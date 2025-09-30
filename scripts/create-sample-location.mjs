import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, query, where, getDocs } from 'firebase/firestore'

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
const db = getFirestore(app)

async function createSampleLocation() {
  console.log('📍 Creating sample location...\n')

  try {
    // Get the client we created
    const clientsQuery = query(
      collection(db, 'clients'),
      where('email', '==', 'john.doe@propertymgmt.com')
    )
    const clientsSnapshot = await getDocs(clientsQuery)
    
    if (clientsSnapshot.empty) {
      console.log('❌ Client not found. Please run: node scripts/create-sample-data.mjs first')
      process.exit(1)
    }
    
    const clientDoc = clientsSnapshot.docs[0]
    const clientData = clientDoc.data()
    const clientId = clientDoc.id
    
    console.log(`✅ Found client: ${clientData.companyName}`)
    
    // Check if location already exists
    const locationsQuery = query(
      collection(db, 'locations'),
      where('clientId', '==', clientId)
    )
    const locationsSnapshot = await getDocs(locationsQuery)
    
    if (!locationsSnapshot.empty) {
      console.log('⏭️  Location already exists for this client')
      console.log(`   Location: ${locationsSnapshot.docs[0].data().name}`)
      console.log('\n✨ You can now create work orders!')
      process.exit(0)
    }
    
    // Create sample location
    const locationData = {
      name: 'Main Office Building',
      address: {
        street: '123 Business Park Drive',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      },
      description: 'Main office building with 5 floors',
      type: 'office',
      status: 'approved',
      clientId: clientId,
      clientName: clientData.companyName || clientData.fullName,
      clientEmail: clientData.email,
      createdBy: clientId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'admin'
    }
    
    const docRef = await addDoc(collection(db, 'locations'), locationData)
    
    console.log('✅ Sample location created successfully!')
    console.log(`   Location: ${locationData.name}`)
    console.log(`   Address: ${locationData.address.street}, ${locationData.address.city}`)
    console.log(`   Status: ${locationData.status}`)
    console.log(`   ID: ${docRef.id}`)
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 Setup Complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n✨ You now have:')
    console.log('  ✅ 9 Categories')
    console.log('  ✅ 1 Approved Client (ABC Property Management)')
    console.log('  ✅ 1 Approved Location (Main Office Building)')
    console.log('  ✅ 1 Approved Subcontractor (Demo HVAC Technician)')
    console.log('\n💡 Now you can:')
    console.log('  1. Hard refresh browser (Ctrl + Shift + R)')
    console.log('  2. Go to Admin Portal > Work Orders')
    console.log('  3. Create a work order with all fields populated!')
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }

  process.exit(0)
}

createSampleLocation()
