import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc, query, collection, getDocs } from 'firebase/firestore'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    const { subcontractorId, actualCost, completionNotes, attachments } = await request.json()

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

    // Verify the subcontractor is assigned to this work order
    if (workOrderData.assignedTo !== subcontractorId) {
      return NextResponse.json(
        { error: 'You are not assigned to this work order' },
        { status: 403 }
      )
    }

    if (workOrderData.status !== 'assigned' && workOrderData.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Work order is not in a state that allows completion' },
        { status: 400 }
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

    return NextResponse.json({
      success: true,
      message: 'Work order completed successfully'
    })

  } catch (error: any) {
    console.error('Error completing work order:', error)
    return NextResponse.json(
      { error: 'Failed to complete work order' },
      { status: 500 }
    )
  }
}
