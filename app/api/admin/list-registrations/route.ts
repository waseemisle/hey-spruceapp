// Using standard Response instead of NextResponse to avoid type issues
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

export async function GET(request: Request) {
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

    return new Response(
        JSON.stringify({
      success: true,
      registrations,
      count: registrations.length
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error fetching registrations:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
