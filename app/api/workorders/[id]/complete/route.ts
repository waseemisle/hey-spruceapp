// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc, query, collection, getDocs, where } from 'firebase/firestore'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    const { subcontractorId, actualCost, completionNotes, attachments } = await request.json()

    // Get work order data
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrderData = workOrderSnap.data()

    if (!workOrderData) {
      return new Response(
        JSON.stringify({ error: 'Work order data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Verify the subcontractor is assigned to this work order
    if (workOrderData.assignedTo !== subcontractorId) {
      return new Response(
        JSON.stringify({ error: 'You are not assigned to this work order' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (workOrderData.status !== 'assigned' && workOrderData.status !== 'in_progress') {
      return new Response(
        JSON.stringify({ error: 'Work order is not in a state that allows completion' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update work order status
    await updateDoc(workOrderRef, {
      status: 'completed_by_contractor',
      actualCost: actualCost ? parseFloat(actualCost) : undefined,
      completedDate: new Date().toISOString(),
      completionNotes,
      attachments,
      updatedAt: new Date().toISOString()
    })

    // Update assigned work order status
    const assignedWorkOrderQuery = query(
      collection(db, COLLECTIONS.ASSIGNED_WORK_ORDERS),
      where('workOrderId', '==', workOrderId),
      where('subcontractorId', '==', subcontractorId)
    )
    
    const assignedWorkOrderSnapshot = await getDocs(assignedWorkOrderQuery)
    if (!assignedWorkOrderSnapshot.empty) {
      const assignedWorkOrderDoc = assignedWorkOrderSnapshot.docs[0]
      await updateDoc(doc(db, COLLECTIONS.ASSIGNED_WORK_ORDERS, assignedWorkOrderDoc.id), {
        status: 'completed',
        actualCost: actualCost ? parseFloat(actualCost) : undefined,
        completedDate: new Date().toISOString(),
        completionNotes,
        attachments,
        updatedAt: new Date().toISOString()
      })
    }

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Work order completed successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error completing work order:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to complete work order' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
