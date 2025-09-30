import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'

export async function GET(request: NextRequest) {
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

    return NextResponse.json(clients)

  } catch (error: any) {
    console.error('Error fetching clients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}
