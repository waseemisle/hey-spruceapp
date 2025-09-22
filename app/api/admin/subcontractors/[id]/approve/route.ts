import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Approve a subcontractor
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const subcontractorId = params.id
    const { adminId, adminName } = await request.json()

    if (!subcontractorId || !adminId || !adminName) {
      return NextResponse.json(
        { error: 'Subcontractor ID, admin ID, and admin name are required' },
        { status: 400 }
      )
    }

    console.log(`Approving subcontractor ${subcontractorId} by admin ${adminName}`)

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
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString()
    })

    console.log(`Subcontractor ${subcontractorId} approved by admin ${adminName}`)

    return NextResponse.json({
      success: true,
      message: 'Subcontractor approved successfully',
      subcontractorId,
      status: 'approved'
    })

  } catch (error) {
    console.error('Error approving subcontractor:', error)
    return NextResponse.json(
      { error: 'Failed to approve subcontractor' },
      { status: 500 }
    )
  }
}

