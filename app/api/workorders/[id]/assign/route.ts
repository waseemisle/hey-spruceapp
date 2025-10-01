// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { subcontractorId } = await request.json()
    const workOrderId = params.id

    if (!subcontractorId) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get work order data
    const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId)
    const workOrderSnap = await workOrderRef.get()

    if (!workOrderSnap.exists) {
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

    // Get subcontractor data
    const subcontractorRef = db.collection(COLLECTIONS.SUBCONTRACTORS).doc(subcontractorId)
    const subcontractorSnap = await subcontractorRef.get()

    if (!subcontractorSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const subcontractorData = subcontractorSnap.data()

    if (!subcontractorData) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update work order status and assignment
    await workOrderRef.update({
      status: 'assigned',
      assignedTo: subcontractorId,
      assignedToName: subcontractorData.fullName,
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    // Create assigned work order for subcontractor
    await db.collection(COLLECTIONS.ASSIGNED_WORK_ORDERS).add({
      workOrderId,
      workOrderTitle: workOrderData.title,
      workOrderDescription: workOrderData.description,
      workOrderLocation: workOrderData.location,
      clientId: workOrderData.clientId,
      clientName: workOrderData.clientName,
      categoryId: workOrderData.categoryId,
      categoryName: workOrderData.categoryName,
      estimatedCost: workOrderData.estimatedCost,
      estimatedDateOfService: workOrderData.estimatedDateOfService,
      subcontractorId,
      subcontractorName: subcontractorData.fullName,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Work order assigned successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error assigning work order:', error)
    return new Response(
        JSON.stringify({ error: error.message || 'Failed to assign work order' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
