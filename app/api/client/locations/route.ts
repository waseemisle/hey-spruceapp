// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'
import { query, where, collection } from 'firebase/firestore'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get locations for specific client
    const q = query(
      collection(db, COLLECTIONS.LOCATIONS),
      where('clientId', '==', clientId)
    )
    
    const { data, error } = await getDocuments(COLLECTIONS.LOCATIONS, [where('clientId', '==', clientId)])
    
    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch locations' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
        JSON.stringify(data),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching client locations:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch locations' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
