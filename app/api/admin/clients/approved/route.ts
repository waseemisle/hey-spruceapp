// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'
import { where } from 'firebase/firestore'

export async function GET(request: Request) {
  try {
    // Get approved clients
    const { data, error } = await getDocuments(COLLECTIONS.CLIENTS, [where('status', '==', 'approved')])
    
    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch approved clients' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
        JSON.stringify(data),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching approved clients:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch approved clients' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
