import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

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

async function debugDatabase() {
  console.log('🔍 Debugging database contents...\n')

  try {
    // Check clients
    console.log('📊 CLIENTS:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const clientsSnapshot = await getDocs(collection(db, 'clients'))
    if (clientsSnapshot.empty) {
      console.log('❌ No clients found\n')
    } else {
      clientsSnapshot.forEach(doc => {
        const data = doc.data()
        console.log(`✅ ID: ${doc.id}`)
        console.log(`   Name: ${data.companyName || data.fullName}`)
        console.log(`   Email: ${data.email}`)
        console.log(`   Status: ${data.status}`)
        console.log('')
      })
    }

    // Check categories
    console.log('📁 CATEGORIES:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const categoriesSnapshot = await getDocs(collection(db, 'categories'))
    if (categoriesSnapshot.empty) {
      console.log('❌ No categories found\n')
    } else {
      categoriesSnapshot.forEach(doc => {
        const data = doc.data()
        console.log(`✅ ID: ${doc.id}`)
        console.log(`   Name: ${data.name}`)
        console.log(`   Active: ${data.isActive}`)
        console.log('')
      })
    }

    // Check locations
    console.log('📍 LOCATIONS:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const locationsSnapshot = await getDocs(collection(db, 'locations'))
    if (locationsSnapshot.empty) {
      console.log('❌ No locations found\n')
    } else {
      locationsSnapshot.forEach(doc => {
        const data = doc.data()
        console.log(`✅ ID: ${doc.id}`)
        console.log(`   Name: ${data.name}`)
        console.log(`   Client: ${data.clientName}`)
        console.log(`   Status: ${data.status}`)
        console.log('')
      })
    }

    // Check subcontractors
    console.log('🔧 SUBCONTRACTORS:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const subcontractorsSnapshot = await getDocs(collection(db, 'subcontractors'))
    if (subcontractorsSnapshot.empty) {
      console.log('❌ No subcontractors found\n')
    } else {
      subcontractorsSnapshot.forEach(doc => {
        const data = doc.data()
        console.log(`✅ ID: ${doc.id}`)
        console.log(`   Name: ${data.fullName}`)
        console.log(`   Email: ${data.email}`)
        console.log(`   Status: ${data.status}`)
        console.log(`   Category: ${data.categoryId}`)
        console.log('')
      })
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 Debug Complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }

  process.exit(0)
}

debugDatabase()
