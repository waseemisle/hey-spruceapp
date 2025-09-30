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

// Categories for subcontractors
const categories = [
  { id: 'electrical', name: 'Electrical Services' },
  { id: 'plumbing', name: 'Plumbing Services' },
  { id: 'hvac', name: 'HVAC Services' },
  { id: 'maintenance', name: 'General Maintenance' },
  { id: 'cleaning', name: 'Cleaning Services' },
  { id: 'security', name: 'Security Systems' },
  { id: 'landscaping', name: 'Landscaping' },
  { id: 'carpentry', name: 'Carpentry' },
  { id: 'painting', name: 'Painting Services' },
  { id: 'flooring', name: 'Flooring Services' }
]

// Skills for each category
const skillsByCategory = {
  electrical: ['Wiring', 'Electrical Repairs', 'Circuit Installation', 'Panel Upgrades', 'Lighting Installation'],
  plumbing: ['Pipe Repair', 'Drain Cleaning', 'Fixture Installation', 'Water Heater Service', 'Leak Detection'],
  hvac: ['AC Repair', 'Heating Systems', 'Ductwork', 'Thermostat Installation', 'Air Quality'],
  maintenance: ['General Repairs', 'Equipment Maintenance', 'Preventive Maintenance', 'Troubleshooting', 'Safety Checks'],
  cleaning: ['Office Cleaning', 'Deep Cleaning', 'Window Cleaning', 'Carpet Cleaning', 'Sanitization'],
  security: ['Camera Installation', 'Access Control', 'Alarm Systems', 'Security Monitoring', 'System Maintenance'],
  landscaping: ['Lawn Care', 'Tree Trimming', 'Garden Maintenance', 'Irrigation', 'Snow Removal'],
  carpentry: ['Furniture Repair', 'Cabinet Installation', 'Door Installation', 'Trim Work', 'Custom Projects'],
  painting: ['Interior Painting', 'Exterior Painting', 'Color Consultation', 'Surface Preparation', 'Touch-ups'],
  flooring: ['Tile Installation', 'Hardwood Installation', 'Carpet Installation', 'Floor Repair', 'Refinishing']
}

async function createTestAccounts() {
  try {
    console.log('🚀 Starting test account creation...')
    
    const credentials = {
      clients: [],
      subcontractors: []
    }

    // Create 20 test clients
    console.log('\n📋 Creating 20 test clients...')
    for (let i = 1; i <= 20; i++) {
      const clientData = {
        fullName: `Test Client ${i}`,
        email: `test.client.${i}@heyspruce.com`,
        password: `client${i}123`,
        phone: `555-${String(i).padStart(3, '0')}-${String(i).padStart(4, '0')}`,
        companyName: `Test Company ${i}`,
        businessType: ['Property Management', 'Real Estate', 'Facility Management', 'Corporate'][i % 4],
        address: {
          street: `${i * 100} Test Street`,
          city: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][i % 5],
          state: ['NY', 'CA', 'IL', 'TX', 'AZ'][i % 5],
          zipCode: `${String(i).padStart(5, '0')}`,
          country: 'USA'
        },
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Create Firebase Auth user
      try {
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(
          clientData.email, 
          clientData.password
        )
        
        // Create client document in Firestore
        await db.collection('clients').doc(userCredential.user.uid).set(clientData)
        
        credentials.clients.push({
          email: clientData.email,
          password: clientData.password,
          name: clientData.fullName,
          company: clientData.companyName,
          uid: userCredential.user.uid
        })
        
        console.log(`✅ Created client ${i}: ${clientData.email}`)
      } catch (error) {
        console.error(`❌ Failed to create client ${i}:`, error.message)
      }
    }

    // Create 20 test subcontractors
    console.log('\n🔧 Creating 20 test subcontractors...')
    for (let i = 1; i <= 20; i++) {
      const category = categories[i % categories.length]
      const skills = skillsByCategory[category.id]
      
      const subcontractorData = {
        fullName: `Test Subcontractor ${i}`,
        email: `test.sub.${i}@heyspruce.com`,
        password: `sub${i}123`,
        phone: `555-${String(i + 100).padStart(3, '0')}-${String(i).padStart(4, '0')}`,
        title: `${category.name} Specialist`,
        categoryId: category.id,
        categoryName: category.name,
        skills: skills.slice(0, 3), // Take first 3 skills
        experience: `${5 + (i % 15)} years`,
        hourlyRate: 50 + (i * 5),
        availability: 'available',
        status: 'approved',
        address: {
          street: `${i * 200} Contractor Lane`,
          city: ['Miami', 'Seattle', 'Denver', 'Atlanta', 'Boston'][i % 5],
          state: ['FL', 'WA', 'CO', 'GA', 'MA'][i % 5],
          zipCode: `${String(i + 10000).padStart(5, '0')}`,
          country: 'USA'
        },
        businessInfo: {
          businessName: `${category.name} Pro ${i}`,
          licenseNumber: `LIC-${String(i).padStart(6, '0')}`,
          insuranceInfo: `Insurance Policy #INS-${String(i).padStart(8, '0')}`
        },
        references: [
          {
            name: `Reference ${i}A`,
            contact: `ref${i}a@example.com`,
            relationship: 'Previous Client'
          },
          {
            name: `Reference ${i}B`,
            contact: `ref${i}b@example.com`,
            relationship: 'Business Partner'
          }
        ],
        approvedAt: new Date().toISOString(),
        approvedBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Create Firebase Auth user
      try {
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(
          subcontractorData.email, 
          subcontractorData.password
        )
        
        // Create subcontractor document in Firestore
        await db.collection('subcontractors').doc(userCredential.user.uid).set(subcontractorData)
        
        credentials.subcontractors.push({
          email: subcontractorData.email,
          password: subcontractorData.password,
          name: subcontractorData.fullName,
          category: category.name,
          skills: subcontractorData.skills,
          hourlyRate: subcontractorData.hourlyRate,
          uid: userCredential.user.uid
        })
        
        console.log(`✅ Created subcontractor ${i}: ${subcontractorData.email} (${category.name})`)
      } catch (error) {
        console.error(`❌ Failed to create subcontractor ${i}:`, error.message)
      }
    }

    // Print credentials for testing
    console.log('\n🎉 Test accounts created successfully!')
    console.log('\n📧 CLIENT CREDENTIALS:')
    console.log('=' .repeat(50))
    credentials.clients.forEach((client, index) => {
      console.log(`${index + 1}. ${client.name} (${client.company})`)
      console.log(`   Email: ${client.email}`)
      console.log(`   Password: ${client.password}`)
      console.log('')
    })

    console.log('\n🔧 SUBCONTRACTOR CREDENTIALS:')
    console.log('=' .repeat(50))
    credentials.subcontractors.forEach((sub, index) => {
      console.log(`${index + 1}. ${sub.name} (${sub.category})`)
      console.log(`   Email: ${sub.email}`)
      console.log(`   Password: ${sub.password}`)
      console.log(`   Skills: ${sub.skills.join(', ')}`)
      console.log(`   Hourly Rate: $${sub.hourlyRate}`)
      console.log('')
    })

    // Save credentials to file
    const fs = await import('fs')
    fs.writeFileSync('./test-accounts-credentials.json', JSON.stringify(credentials, null, 2))
    console.log('\n💾 Credentials saved to test-accounts-credentials.json')

  } catch (error) {
    console.error('❌ Error creating test accounts:', error)
  }
}

// Run the script
createTestAccounts()
