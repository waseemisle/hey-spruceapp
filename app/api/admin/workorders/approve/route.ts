// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(request: Request) {
  try {
    const { workOrderId, adminId } = await request.json()

    if (!workOrderId || !adminId) {
      return new Response(
        JSON.stringify({ error: 'Work Order ID and Admin ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Work Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrderData = workOrderSnap.data()

    if (workOrderData.status !== 'pending') {
      return new Response(
        JSON.stringify({ message: 'Work Order already processed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update work order status to approved
    await updateDoc(workOrderRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString(),
    })

    return new Response(
        JSON.stringify({ success: true, message: 'Work Order approved successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error approving work order:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to approve work order' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}