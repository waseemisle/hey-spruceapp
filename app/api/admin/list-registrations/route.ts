import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore'
import { initializeApp } from 'firebase/app'

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

export async function GET(request: NextRequest) {
  try {
    const q = query(
      collection(db, 'client_registrations'),
      orderBy('submittedAt', 'desc')
    )
    
    const snapshot = await getDocs(q)
    const registrations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log('API: Found registrations:', registrations)

    return NextResponse.json({
      success: true,
      registrations,
      count: registrations.length
    })

  } catch (error) {
    console.error('Error fetching registrations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
