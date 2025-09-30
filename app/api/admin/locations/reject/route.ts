// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(request: Request) {
  try {
    const { locationId, adminId, reason } = await request.json()

    if (!locationId || !adminId || !reason) {
      return new Response(
        JSON.stringify({ error: 'Location ID, Admin ID, and rejection reason are required' }, { status: 400 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
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

    // Update location status to rejected
    await updateDoc(locationRef, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString(),
    })

    return new Response(
        JSON.stringify({ success: true, message: 'Location rejected successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error rejecting location:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to reject location' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}