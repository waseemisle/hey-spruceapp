// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(request: Request) {
  try {
    const { locationId, adminId } = await request.json()

    if (!locationId || !adminId) {
      return new Response(
        JSON.stringify({ error: 'Location ID and Admin ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const locationRef = doc(db, COLLECTIONS.LOCATIONS, locationId)
    const locationSnap = await getDoc(locationRef)

    if (!locationSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const locationData = locationSnap.data()

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

    // Update location status to approved
    await updateDoc(locationRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
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