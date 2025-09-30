import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc, addDoc, collection } from 'firebase/firestore'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { subcontractorId } = await request.json()
    const workOrderId = params.id

    if (!subcontractorId) {
      return NextResponse.json(
        { error: 'Subcontractor ID is required' },
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

    // Get subcontractor data
    const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, subcontractorId)
    const subcontractorSnap = await getDoc(subcontractorRef)

    if (!subcontractorSnap.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
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

    return NextResponse.json({
      success: true,
      message: 'Work order assigned successfully'
    })

  } catch (error: any) {
    console.error('Error assigning work order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to assign work order' },
      { status: 500 }
    )
  }
}
