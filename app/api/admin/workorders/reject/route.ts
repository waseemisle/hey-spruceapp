import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { workOrderId, adminId, reason } = await request.json()

    if (!workOrderId || !adminId || !reason) {
      return NextResponse.json({ error: 'Work Order ID, Admin ID, and rejection reason are required' }, { status: 400 })
    }

    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return NextResponse.json({ error: 'Work Order not found' }, { status: 404 })
    }

    // Update work order status to rejected
    await updateDoc(workOrderRef, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'Work Order rejected successfully' })

  } catch (error: any) {
    console.error('Error rejecting work order:', error)
    return NextResponse.json({ error: 'Failed to reject work order' }, { status: 500 })
  }
}