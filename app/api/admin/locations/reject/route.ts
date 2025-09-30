// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function POST(request: Request) {
  try {
    const { locationId, rejectedBy, reason } = await request.json()

    if (!locationId || !rejectedBy || !reason) {
      return new Response(
        JSON.stringify({ error: 'Location ID, Admin ID, and rejection reason are required' }),
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

    // Update location status to rejected using compat API
    await db.collection(COLLECTIONS.LOCATIONS).doc(locationId).update({
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: rejectedBy,
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