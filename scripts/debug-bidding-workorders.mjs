import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'

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

const COLLECTIONS = {
  BIDDING_WORK_ORDERS: 'biddingWorkOrders',
  SUBCONTRACTORS: 'subcontractors',
  WORK_ORDERS: 'workOrders'
}

async function debugBiddingWorkOrders() {
  try {
    console.log('🔍 Debugging Bidding Work Orders...\n')

    // 1. Get all bidding work orders
    console.log('1. All Bidding Work Orders:')
    const biddingWorkOrdersRef = collection(db, COLLECTIONS.BIDDING_WORK_ORDERS)
    const biddingWorkOrdersSnapshot = await getDocs(biddingWorkOrdersRef)
    
    if (biddingWorkOrdersSnapshot.empty) {
      console.log('   ❌ No bidding work orders found in database')
    } else {
      console.log(`   ✅ Found ${biddingWorkOrdersSnapshot.size} bidding work orders:`)
      biddingWorkOrdersSnapshot.forEach(doc => {
        const data = doc.data()
        console.log(`   - ID: ${doc.id}`)
        console.log(`     Work Order: ${data.workOrderTitle}`)
        console.log(`     Subcontractor ID: ${data.subcontractorId}`)
        console.log(`     Subcontractor Name: ${data.subcontractorName}`)
        console.log(`     Status: ${data.status}`)
        console.log(`     Created: ${data.createdAt}`)
        console.log('')
      })
    }

    // 2. Get all subcontractors
    console.log('2. All Subcontractors:')
    const subcontractorsRef = collection(db, COLLECTIONS.SUBCONTRACTORS)
    const subcontractorsSnapshot = await getDocs(subcontractorsRef)
    
    if (subcontractorsSnapshot.empty) {
      console.log('   ❌ No subcontractors found in database')
    } else {
      console.log(`   ✅ Found ${subcontractorsSnapshot.size} subcontractors:`)
      subcontractorsSnapshot.forEach(doc => {
        const data = doc.data()
        console.log(`   - ID: ${doc.id}`)
        console.log(`     Name: ${data.fullName}`)
        console.log(`     Email: ${data.email}`)
        console.log(`     Category ID: ${data.categoryId}`)
        console.log(`     Status: ${data.status}`)
        console.log('')
      })
    }

    // 3. Check if bidding work orders match subcontractor IDs
    console.log('3. Checking ID Matches:')
    if (!biddingWorkOrdersSnapshot.empty && !subcontractorsSnapshot.empty) {
      const subcontractorIds = new Set()
      subcontractorsSnapshot.forEach(doc => {
        subcontractorIds.add(doc.id)
      })

      let matchCount = 0
      let mismatchCount = 0

      biddingWorkOrdersSnapshot.forEach(doc => {
        const data = doc.data()
        if (subcontractorIds.has(data.subcontractorId)) {
          console.log(`   ✅ Match: Bidding work order subcontractor ID ${data.subcontractorId} exists`)
          matchCount++
        } else {
          console.log(`   ❌ Mismatch: Bidding work order subcontractor ID ${data.subcontractorId} NOT found in subcontractors`)
          mismatchCount++
        }
      })

      console.log(`\n   Summary: ${matchCount} matches, ${mismatchCount} mismatches`)
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

debugBiddingWorkOrders()
