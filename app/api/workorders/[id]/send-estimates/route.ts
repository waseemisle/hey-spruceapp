import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    const { subcontractorIds } = await request.json()

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
        { error: 'Work Order not found' },
        { status: 404 }
      )
    }

    const workOrderData = workOrderSnap.data()

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

    return NextResponse.json({
      success: true,
      message: 'Work order sent to subcontractors for bidding',
      biddingWorkOrders
    })

  } catch (error: any) {
    console.error('Error sending work order for estimates:', error)
    return NextResponse.json(
      { error: 'Failed to send work order for estimates' },
      { status: 500 }
    )
  }
}
