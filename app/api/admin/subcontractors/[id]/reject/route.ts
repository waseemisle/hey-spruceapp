// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Reject a subcontractor
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const subcontractorId = params.id
    const { adminId, adminName, rejectionReason } = await request.json()

    if (!subcontractorId || !adminId || !adminName || !rejectionReason) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor ID, admin ID, admin name, and rejection reason are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Rejecting subcontractor ${subcontractorId} by admin ${adminName}`)

    // Get the subcontractor to verify it exists
    const subcontractorRef = doc(db, 'subcontractors', subcontractorId)
    const subcontractorSnap = await getDoc(subcontractorRef)

    if (!subcontractorSnap.exists()) {
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

    // Check if already approved or rejected
    if (subcontractorData.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Subcontractor is already ${subcontractorData.status}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update the subcontractor status
    await updateDoc(subcontractorRef, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: rejectionReason,
      updatedAt: new Date().toISOString()
    })

    console.log(`Subcontractor ${subcontractorId} rejected by admin ${adminName}`)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Subcontractor rejected successfully',
      subcontractorId,
      status: 'rejected'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error rejecting subcontractor:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to reject subcontractor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

