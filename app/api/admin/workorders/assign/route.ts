// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore'

export async function POST(request: Request) {
  try {
    const { workOrderId, subcontractorId, adminId } = await request.json()

    if (!workOrderId || !subcontractorId || !adminId) {
      return new Response(
        JSON.stringify({ error: 'Work Order ID, Subcontractor ID, and Admin ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get work order data
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Work Order not found' }),
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

    if (workOrderData.status !== 'quote_approved') {
      return new Response(
        JSON.stringify({ error: 'Work Order must be in quote_approved status to be assigned' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update work order status and assignment
    await updateDoc(workOrderRef, {
      status: 'assigned',
      assignedTo: subcontractorId,
      assignedAt: new Date().toISOString(),
      assignedBy: adminId,
      updatedAt: new Date().toISOString(),
    })

    // Create assigned work order record
    const assignedWorkOrderData = {
      workOrderId,
      workOrderTitle: workOrderData.title,
      workOrderDescription: workOrderData.description,
      workOrderLocation: workOrderData.location,
      clientId: workOrderData.clientId,
      clientName: workOrderData.clientName,
      clientEmail: workOrderData.clientEmail,
      categoryId: workOrderData.categoryId,
      categoryName: workOrderData.categoryName,
      estimatedCost: workOrderData.estimatedCost,
      estimatedDateOfService: workOrderData.estimatedDateOfService,
      subcontractorId,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      assignedBy: adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    await addDoc(collection(db, COLLECTIONS.ASSIGNED_WORK_ORDERS), assignedWorkOrderData)

    return new Response(
        JSON.stringify({ success: true, message: 'Work Order assigned successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error assigning work order:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to assign work order' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}