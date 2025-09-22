import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Reject a subcontractor
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const subcontractorId = params.id
    const { adminId, adminName, rejectionReason } = await request.json()

    if (!subcontractorId || !adminId || !adminName || !rejectionReason) {
      return NextResponse.json(
        { error: 'Subcontractor ID, admin ID, admin name, and rejection reason are required' },
        { status: 400 }
      )
    }

    console.log(`Rejecting subcontractor ${subcontractorId} by admin ${adminName}`)

    // Get the subcontractor to verify it exists
    const subcontractorRef = doc(db, 'subcontractors', subcontractorId)
    const subcontractorSnap = await getDoc(subcontractorRef)

    if (!subcontractorSnap.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      )
    }

    const subcontractorData = subcontractorSnap.data()

    // Check if already approved or rejected
    if (subcontractorData.status !== 'pending') {
      return NextResponse.json(
        { error: `Subcontractor is already ${subcontractorData.status}` },
        { status: 400 }
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

    return NextResponse.json({
      success: true,
      message: 'Subcontractor rejected successfully',
      subcontractorId,
      status: 'rejected'
    })

  } catch (error) {
    console.error('Error rejecting subcontractor:', error)
    return NextResponse.json(
      { error: 'Failed to reject subcontractor' },
      { status: 500 }
    )
  }
}

