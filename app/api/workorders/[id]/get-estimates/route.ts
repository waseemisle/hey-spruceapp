// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { subcontractorIds } = await request.json()
    const workOrderId = params.id

    if (!subcontractorIds || !Array.isArray(subcontractorIds) || subcontractorIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor IDs are required' }),
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

    // Update work order status
    await workOrderRef.update({
      status: 'waiting_for_quote',
      selectedSubcontractors: subcontractorIds,
      updatedAt: new Date().toISOString()
    })

    // Create bidding work orders for each selected subcontractor
    for (const subcontractorId of subcontractorIds) {
      // Get subcontractor data
      const subcontractorRef = db.collection(COLLECTIONS.SUBCONTRACTORS).doc(subcontractorId)
      const subcontractorSnap = await subcontractorRef.get()

      if (subcontractorSnap.exists) {
        const subcontractorData = subcontractorSnap.data()

        if (!subcontractorData) {
          console.warn(`Subcontractor data not found for ID: ${subcontractorId}`)
          continue
        }

        // Create bidding work order
        const biddingWorkOrderData = {
          workOrderId,
          workOrderNumber: workOrderData.workOrderNumber,
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
          subcontractorEmail: subcontractorData.email,
          status: 'open_for_bidding',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        console.log('Creating bidding work order for subcontractor:', {
          subcontractorId,
          subcontractorName: subcontractorData.fullName,
          workOrderTitle: workOrderData.title
        })
        
        const docRef = await db.collection(COLLECTIONS.BIDDING_WORK_ORDERS).add(biddingWorkOrderData)
        console.log('Bidding work order created with ID:', docRef.id)
      }
    }

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Estimate requests sent to selected subcontractors'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error sending estimate requests:', error)
    return new Response(
        JSON.stringify({ error: error.message || 'Failed to send estimate requests' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
