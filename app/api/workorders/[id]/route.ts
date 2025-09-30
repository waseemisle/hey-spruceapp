// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore'

export async function PUT(
  request: Request,
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
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
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

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Work order updated successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Work order update error:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrderData = {
      id: workOrderSnap.id,
      ...workOrderSnap.data()
    }

    return new Response(
        JSON.stringify({
      success: true,
      workOrder: workOrderData
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error fetching work order:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    
    console.log('DELETE request received for work order ID:', workOrderId)

    if (!workOrderId) {
      console.error('No work order ID provided')
      return new Response(
        JSON.stringify({ error: 'Work order ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if work order exists
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    console.log('Checking work order existence...')
    
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      console.log('Work order not found in database:', workOrderId)
      return new Response(
        JSON.stringify({ 
          error: 'Work order not found',
          workOrderId: workOrderId,
          message: 'The work order you are trying to delete does not exist in the database'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('Work order found, proceeding with deletion:', workOrderSnap.data())

    // Delete the work order from Firebase
    await deleteDoc(workOrderRef)

    console.log('Work order deleted successfully:', workOrderId)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Work order deleted successfully',
      workOrderId: workOrderId
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error deleting work order:', error)
    return new Response(
        JSON.stringify({ 
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred while deleting the work order'
      }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}