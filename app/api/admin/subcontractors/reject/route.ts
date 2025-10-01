// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
export async function POST(request: Request) {
  try {
    const { subcontractorId, adminId, reason } = await request.json()

    if (!subcontractorId || !adminId || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: subcontractorId, adminId, and reason' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get subcontractor data
    const subcontractorRef = db.collection(COLLECTIONS.SUBCONTRACTORS).doc(subcontractorId)
    const subcontractorSnap = await subcontractorRef.get()

    if (!subcontractorSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const subcontractorData = subcontractorSnap.data()

    if (!subcontractorData) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (subcontractorData.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Subcontractor is not in pending status' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update subcontractor status to rejected
    await subcontractorRef.update({
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString()
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Subcontractor rejected successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error rejecting subcontractor:', error)
    return new Response(
        JSON.stringify({ error: error.message || 'Failed to reject subcontractor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
