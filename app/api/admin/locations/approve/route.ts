// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function POST(request: Request) {
  try {
    const { locationId, approvedBy } = await request.json()

    if (!locationId || !approvedBy) {
      return new Response(
        JSON.stringify({ error: 'Location ID and Admin ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get location document using compat API
    const locationDoc = await db.collection(COLLECTIONS.LOCATIONS).doc(locationId).get()

    if (!locationDoc.exists) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const locationData = locationDoc.data()

    if (!locationData) {
      return new Response(
        JSON.stringify({ error: 'Location data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (locationData.status === 'approved') {
      return new Response(
        JSON.stringify({ message: 'Location already approved' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update location status to approved using compat API
    await db.collection(COLLECTIONS.LOCATIONS).doc(locationId).update({
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: approvedBy,
      updatedAt: new Date().toISOString(),
    })

    return new Response(
        JSON.stringify({ success: true, message: 'Location approved successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error approving location:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to approve location' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}