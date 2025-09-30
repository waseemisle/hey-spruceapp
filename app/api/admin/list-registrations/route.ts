import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'

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
