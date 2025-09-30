import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc, addDoc, collection } from 'firebase/firestore'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { subcontractorIds } = await request.json()
    const workOrderId = params.id

    if (!subcontractorIds || !Array.isArray(subcontractorIds) || subcontractorIds.length === 0) {
      return NextResponse.json(
        { error: 'Subcontractor IDs are required' },
        { status: 400 }
      )
    }

    // Get work order data
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    const workOrderData = workOrderSnap.data()

    // Update work order status
    await updateDoc(workOrderRef, {
      status: 'waiting_for_quote',
      selectedSubcontractors: subcontractorIds,
      updatedAt: new Date().toISOString()
    })

    // Create bidding work orders for each selected subcontractor
    for (const subcontractorId of subcontractorIds) {
      // Get subcontractor data
      const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, subcontractorId)
      const subcontractorSnap = await getDoc(subcontractorRef)

      if (subcontractorSnap.exists()) {
        const subcontractorData = subcontractorSnap.data()

        // Create bidding work order
        const biddingWorkOrderData = {
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
        
        const docRef = await addDoc(collection(db, COLLECTIONS.BIDDING_WORK_ORDERS), biddingWorkOrderData)
        console.log('Bidding work order created with ID:', docRef.id)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Estimate requests sent to selected subcontractors'
    })

  } catch (error: any) {
    console.error('Error sending estimate requests:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send estimate requests' },
      { status: 500 }
    )
  }
}
