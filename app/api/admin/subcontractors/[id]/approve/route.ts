// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
// Approve a subcontractor
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const subcontractorId = params.id
    const { adminId, adminName } = await request.json()

    if (!subcontractorId || !adminId || !adminName) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor ID, admin ID, and admin name are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Approving subcontractor ${subcontractorId} by admin ${adminName}`)

    // Get the subcontractor to verify it exists
    const subcontractorRef = db.collection('subcontractors').doc(subcontractorId)
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

    // Check if already approved or rejected
    if (subcontractorData.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Subcontractor is already ${subcontractorData.status}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update the subcontractor status
    await subcontractorRef.update({
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString()
    })

    console.log(`Subcontractor ${subcontractorId} approved by admin ${adminName}`)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Subcontractor approved successfully',
      subcontractorId,
      status: 'approved'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error approving subcontractor:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to approve subcontractor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

