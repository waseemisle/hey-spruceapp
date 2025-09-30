import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

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

async function checkDemoUsers() {
  console.log('🔍 Checking demo users in database...\n')

  const demoEmails = [
    'demo.client@heyspruce.com',
    'demo.admin@heyspruce.com',
    'demo.sub@heyspruce.com'
  ]

  for (const email of demoEmails) {
    console.log(`📧 Checking: ${email}`)
    
    // Check in users collection
    const usersQuery = query(collection(db, 'users'), where('email', '==', email))
    const usersSnapshot = await getDocs(usersQuery)
    
    if (!usersSnapshot.empty) {
      const userData = usersSnapshot.docs[0].data()
      console.log(`✅ Found in 'users' collection:`)
      console.log(`   UID: ${usersSnapshot.docs[0].id}`)
      console.log(`   Name: ${userData.fullName}`)
      console.log(`   Role: ${userData.role}`)
      console.log(`   Status: ${userData.status || 'N/A'}`)
      
      // Check in role-specific collection
      if (userData.role === 'client') {
        const clientsQuery = query(collection(db, 'clients'), where('email', '==', email))
        const clientsSnapshot = await getDocs(clientsQuery)
        if (!clientsSnapshot.empty) {
          console.log(`✅ Found in 'clients' collection`)
        } else {
          console.log(`⚠️  NOT found in 'clients' collection`)
        }
      } else if (userData.role === 'subcontractor') {
        const subsQuery = query(collection(db, 'subcontractors'), where('email', '==', email))
        const subsSnapshot = await getDocs(subsQuery)
        if (!subsSnapshot.empty) {
          console.log(`✅ Found in 'subcontractors' collection`)
        } else {
          console.log(`⚠️  NOT found in 'subcontractors' collection`)
        }
      }
    } else {
      console.log(`❌ NOT found in 'users' collection`)
    }
    console.log('')
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 Summary:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('If all users show ✅ in both collections, you can log in!')
  console.log('If any show ⚠️  or ❌, run the setup script again.')
  console.log('')
  console.log('🔐 Login at: http://localhost:3000/portal-login')
  console.log('')
  console.log('📝 Credentials:')
  console.log('   Client: demo.client@heyspruce.com / demo123')
  console.log('   Admin: demo.admin@heyspruce.com / demo123')
  console.log('   Subcontractor: demo.sub@heyspruce.com / demo123')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  process.exit(0)
}

checkDemoUsers().catch(error => {
  console.error('❌ Error:', error)
  process.exit(1)
})
