// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
export async function POST(request: Request) {
  try {
    const { workOrderId, adminId, reason } = await request.json()

    if (!workOrderId || !adminId || !reason) {
      return new Response(
        JSON.stringify({ error: 'Work Order ID, Admin ID, and rejection reason are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId)
    const workOrderSnap = await workOrderRef.get()

    if (!workOrderSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Work Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update work order status to rejected
    await workOrderRef.update({
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString(),
    })

    return new Response(
        JSON.stringify({ success: true, message: 'Work Order rejected successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error rejecting work order:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to reject work order' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}