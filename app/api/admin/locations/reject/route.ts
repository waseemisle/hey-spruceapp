import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { locationId, adminId, reason } = await request.json()

    if (!locationId || !adminId || !reason) {
      return NextResponse.json({ error: 'Location ID, Admin ID, and rejection reason are required' }, { status: 400 })
    }

    const locationRef = doc(db, COLLECTIONS.LOCATIONS, locationId)
    const locationSnap = await getDoc(locationRef)

    if (!locationSnap.exists()) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Update location status to rejected
    await updateDoc(locationRef, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'Location rejected successfully' })

  } catch (error: any) {
    console.error('Error rejecting location:', error)
    return NextResponse.json({ error: 'Failed to reject location' }, { status: 500 })
  }
}