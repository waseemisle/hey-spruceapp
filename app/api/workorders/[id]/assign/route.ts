// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc, addDoc, collection } from 'firebase/firestore'

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
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrderData = workOrderSnap.data()

    // Get subcontractor data
    const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, subcontractorId)
    const subcontractorSnap = await getDoc(subcontractorRef)

    if (!subcontractorSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const subcontractorData = subcontractorSnap.data()

    // Update work order status and assignment
    await updateDoc(workOrderRef, {
      status: 'assigned',
      assignedTo: subcontractorId,
      assignedToName: subcontractorData.fullName,
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    // Create assigned work order for subcontractor
    await addDoc(collection(db, COLLECTIONS.ASSIGNED_WORK_ORDERS), {
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
