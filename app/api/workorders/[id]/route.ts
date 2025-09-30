import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    const workOrderData = await request.json()
    
    console.log('Updating work order:', workOrderId, workOrderData)

    // Check if work order exists
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    // Prepare update data
    const updateData = {
      title: workOrderData.title,
      description: workOrderData.description,
      priority: workOrderData.priority,
      category: workOrderData.category,
      status: workOrderData.status,
      location: workOrderData.location,
      estimatedCost: workOrderData.estimatedCost ? parseFloat(workOrderData.estimatedCost) : 0,
      estimatedDuration: workOrderData.estimatedDuration || 0,
      scheduledDate: workOrderData.scheduledDate || '',
      notes: workOrderData.notes || '',
      updatedAt: new Date().toISOString()
    }

    // Update the work order
    await updateDoc(workOrderRef, updateData)

    return NextResponse.json({
      success: true,
      message: 'Work order updated successfully'
    })

  } catch (error) {
    console.error('Work order update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    const workOrderData = {
      id: workOrderSnap.id,
      ...workOrderSnap.data()
    }

    return NextResponse.json({
      success: true,
      workOrder: workOrderData
    })

  } catch (error) {
    console.error('Error fetching work order:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    
    console.log('DELETE request received for work order ID:', workOrderId)

    if (!workOrderId) {
      console.error('No work order ID provided')
      return NextResponse.json(
        { error: 'Work order ID is required' },
        { status: 400 }
      )
    }

    // Check if work order exists
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    console.log('Checking work order existence...')
    
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      console.log('Work order not found in database:', workOrderId)
      return NextResponse.json(
        { 
          error: 'Work order not found',
          workOrderId: workOrderId,
          message: 'The work order you are trying to delete does not exist in the database'
        },
        { status: 404 }
      )
    }

    console.log('Work order found, proceeding with deletion:', workOrderSnap.data())

    // Delete the work order from Firebase
    await deleteDoc(workOrderRef)

    console.log('Work order deleted successfully:', workOrderId)

    return NextResponse.json({
      success: true,
      message: 'Work order deleted successfully',
      workOrderId: workOrderId
    })

  } catch (error: any) {
    console.error('Error deleting work order:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred while deleting the work order'
      },
      { status: 500 }
    )
  }
}