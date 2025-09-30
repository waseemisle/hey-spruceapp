// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('Fetching subcontractor profile for user:', userId)

    // Get subcontractor profile directly by document ID
    const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, userId)
    const subcontractorDoc = await getDoc(subcontractorRef)
    
    if (!subcontractorDoc.exists()) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor profile not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const subcontractorData = {
      id: subcontractorDoc.id,
      ...subcontractorDoc.data()
    }

    console.log('Subcontractor profile found:', subcontractorData?.fullName)

    return new Response(
        JSON.stringify(subcontractorData),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching subcontractor profile:', error)
    return new Response(
        JSON.stringify({ error: `Failed to fetch subcontractor profile: ${error.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
