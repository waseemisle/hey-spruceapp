import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { workOrderId, adminId } = await request.json()

    if (!workOrderId || !adminId) {
      return NextResponse.json({ error: 'Work Order ID and Admin ID are required' }, { status: 400 })
    }

    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return NextResponse.json({ error: 'Work Order not found' }, { status: 404 })
    }

    const workOrderData = workOrderSnap.data()

    if (workOrderData.status !== 'pending') {
      return NextResponse.json({ message: 'Work Order already processed' }, { status: 200 })
    }

    // Update work order status to approved
    await updateDoc(workOrderRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'Work Order approved successfully' })

  } catch (error: any) {
    console.error('Error approving work order:', error)
    return NextResponse.json({ error: 'Failed to approve work order' }, { status: 500 })
  }
}