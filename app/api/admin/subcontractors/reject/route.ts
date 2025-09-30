import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { subcontractorId, adminId, reason } = await request.json()

    if (!subcontractorId || !adminId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: subcontractorId, adminId, and reason' },
        { status: 400 }
      )
    }

    // Get subcontractor data
    const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, subcontractorId)
    const subcontractorSnap = await getDoc(subcontractorRef)

    if (!subcontractorSnap.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      )
    }

    const subcontractorData = subcontractorSnap.data()

    if (subcontractorData.status !== 'pending') {
      return NextResponse.json(
        { error: 'Subcontractor is not in pending status' },
        { status: 400 }
      )
    }

    // Update subcontractor status to rejected
    await updateDoc(subcontractorRef, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Subcontractor rejected successfully'
    })

  } catch (error: any) {
    console.error('Error rejecting subcontractor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reject subcontractor' },
      { status: 500 }
    )
  }
}
