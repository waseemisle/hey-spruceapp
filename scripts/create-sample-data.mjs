import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore'

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

// Sample categories
const sampleCategories = [
  { name: 'HVAC', description: 'Heating, Ventilation, and Air Conditioning', isActive: true },
  { name: 'Plumbing', description: 'Plumbing services and repairs', isActive: true },
  { name: 'Electrical', description: 'Electrical work and installations', isActive: true },
  { name: 'Carpentry', description: 'Carpentry and woodwork', isActive: true },
  { name: 'Painting', description: 'Interior and exterior painting', isActive: true },
  { name: 'Landscaping', description: 'Lawn care and landscaping', isActive: true },
  { name: 'Roofing', description: 'Roof repair and installation', isActive: true },
  { name: 'Cleaning', description: 'Janitorial and cleaning services', isActive: true }
]

// Sample approved client
const sampleClient = {
  id: 'demo-client-001',
  userId: 'demo-client-001',
  email: 'john.doe@propertymgmt.com',
  fullName: 'John Doe',
  role: 'client',
  companyName: 'ABC Property Management',
  phone: '+1-555-0201',
  businessType: 'Commercial Real Estate',
  numberOfProperties: 25,
  estimatedMonthlySpend: '$10000-$20000',
  preferredServices: ['HVAC', 'Plumbing', 'Electrical'],
  status: 'approved',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

async function createSampleData() {
  console.log('🚀 Creating sample data for testing...\n')

  try {
    // Create Categories
    console.log('📁 Creating categories...')
    let categoriesCreated = 0
    
    for (const category of sampleCategories) {
      // Check if category already exists
      const existingQuery = query(
        collection(db, 'categories'),
        where('name', '==', category.name)
      )
      const existingDocs = await getDocs(existingQuery)
      
      if (existingDocs.empty) {
        await addDoc(collection(db, 'categories'), {
          ...category,
          createdBy: 'system',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        categoriesCreated++
        console.log(`  ✅ Created: ${category.name}`)
      } else {
        console.log(`  ⏭️  Skipped: ${category.name} (already exists)`)
      }
    }
    
    console.log(`\n✅ Categories: ${categoriesCreated} created\n`)

    // Create Sample Client
    console.log('👤 Creating sample approved client...')
    
    // Check if client already exists
    const existingClientQuery = query(
      collection(db, 'clients'),
      where('email', '==', sampleClient.email)
    )
    const existingClientDocs = await getDocs(existingClientQuery)
    
    if (existingClientDocs.empty) {
      await addDoc(collection(db, 'clients'), sampleClient)
      
      // Also add to users collection
      await addDoc(collection(db, 'users'), sampleClient)
      
      console.log(`  ✅ Created client: ${sampleClient.companyName}`)
      console.log(`     Email: ${sampleClient.email}`)
      console.log(`     Status: ${sampleClient.status}`)
    } else {
      console.log(`  ⏭️  Client already exists: ${sampleClient.email}`)
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 Sample Data Created Successfully!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n📊 What was created:')
    console.log(`  ✅ ${categoriesCreated > 0 ? categoriesCreated : 'All'} Categories (HVAC, Plumbing, Electrical, etc.)`)
    console.log(`  ✅ 1 Approved Client (ABC Property Management)`)
    console.log('\n💡 Now you can:')
    console.log('  1. Hard refresh your browser (Ctrl + Shift + R)')
    console.log('  2. Go to Admin Portal > Work Orders')
    console.log('  3. Click "Create Work Order"')
    console.log('  4. You will see categories and clients in the dropdowns!')
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (error) {
    console.error('❌ Error creating sample data:', error)
    process.exit(1)
  }

  process.exit(0)
}

createSampleData()
