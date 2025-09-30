// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'

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

    // Get locations for specific client - search by both clientId and clientEmail
    // to handle cases where clientId might be the email or the actual profile ID
    const locationsByIdQuery = db.collection('locations').where('clientId', '==', clientId)
    const locationsByEmailQuery = db.collection('locations').where('clientEmail', '==', clientId)
    
    const [snapshotById, snapshotByEmail] = await Promise.all([
      locationsByIdQuery.get(),
      locationsByEmailQuery.get()
    ])
    
    // Combine results and remove duplicates
    const allDocs = [...snapshotById.docs, ...snapshotByEmail.docs]
    const uniqueDocs = allDocs.filter((doc, index, self) => 
      index === self.findIndex(d => d.id === doc.id)
    )
    
    const locations = uniqueDocs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[]
    
    // Sort by createdAt descending (client-side sorting)
    locations.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()
      return dateB - dateA
    })
    
    return new Response(
      JSON.stringify(locations),
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
