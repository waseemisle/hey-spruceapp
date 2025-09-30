// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'

export async function GET(request: Request) {
  try {
    // Fetch all clients from the 'clients' collection
    const clientsQuery = query(
      collection(db, COLLECTIONS.CLIENTS),
      orderBy('createdAt', 'desc')
    )
    
    const clientsSnapshot = await getDocs(clientsQuery)
    const clients = clientsSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        ...data,
        id: doc.id  // Ensure Firebase document ID is used, not the id field in the data
      }
    })

    return new Response(
        JSON.stringify(clients),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching clients:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch clients' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
