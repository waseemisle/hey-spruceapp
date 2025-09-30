import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { locationId, adminId } = await request.json()

    if (!locationId || !adminId) {
      return NextResponse.json({ error: 'Location ID and Admin ID are required' }, { status: 400 })
    }

    const locationRef = doc(db, COLLECTIONS.LOCATIONS, locationId)
    const locationSnap = await getDoc(locationRef)

    if (!locationSnap.exists()) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const locationData = locationSnap.data()

    if (locationData.status === 'approved') {
      return NextResponse.json({ message: 'Location already approved' }, { status: 200 })
    }

    // Update location status to approved
    await updateDoc(locationRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'Location approved successfully' })

  } catch (error: any) {
    console.error('Error approving location:', error)
    return NextResponse.json({ error: 'Failed to approve location' }, { status: 500 })
  }
}