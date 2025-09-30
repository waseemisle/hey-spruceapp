import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { subcontractorId, adminId } = await request.json()

    if (!subcontractorId || !adminId) {
      return NextResponse.json(
        { error: 'Missing required fields: subcontractorId and adminId' },
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

    if (!subcontractorData) {
      return NextResponse.json({ error: 'Subcontractor data not found' }, { status: 404 })
    }

    if (subcontractorData.status !== 'pending') {
      return NextResponse.json(
        { error: 'Subcontractor is not in pending status' },
        { status: 400 }
      )
    }

    // Update subcontractor status to approved
    await updateDoc(subcontractorRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Subcontractor approved successfully'
    })

  } catch (error: any) {
    console.error('Error approving subcontractor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to approve subcontractor' },
      { status: 500 }
    )
  }
}
