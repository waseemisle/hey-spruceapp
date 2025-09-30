// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    const { subcontractorIds } = await request.json()

    if (!subcontractorIds || !Array.isArray(subcontractorIds) || subcontractorIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor IDs are required' }),
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

    // Update work order status
    await updateDoc(workOrderRef, {
      status: 'waiting_for_quote',
      updatedAt: new Date().toISOString()
    })

    // Create bidding work orders for each subcontractor
    const biddingWorkOrders = []
    for (const subcontractorId of subcontractorIds) {
      const biddingWorkOrderData = {
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
        status: 'open_for_bidding',
        sharedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.BIDDING_WORK_ORDERS), biddingWorkOrderData)
      biddingWorkOrders.push({ id: docRef.id, ...biddingWorkOrderData })
    }

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Work order sent to subcontractors for bidding',
      biddingWorkOrders
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error sending work order for estimates:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to send work order for estimates' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
