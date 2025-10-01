// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    const workOrderData = await request.json()
    
    console.log('Updating work order:', workOrderId)
    console.log('Received data:', JSON.stringify(workOrderData, null, 2))

    // Check if work order exists
    const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId)
    const workOrderSnap = await workOrderRef.get()
    
    if (!workOrderSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare update data - handle both old and new field names
    const updateData: any = {
      title: workOrderData.title,
      description: workOrderData.description,
      priority: workOrderData.priority,
      estimatedCost: workOrderData.estimatedCost ? parseFloat(workOrderData.estimatedCost) : 0,
      updatedAt: new Date().toISOString()
    }

    // Handle category (can be categoryId or category)
    if (workOrderData.categoryId) {
      updateData.categoryId = workOrderData.categoryId
    } else if (workOrderData.category) {
      updateData.category = workOrderData.category
    }

    // Handle location (can be locationId or location)
    if (workOrderData.locationId) {
      updateData.locationId = workOrderData.locationId
    } else if (workOrderData.location) {
      updateData.location = workOrderData.location
    }

    // Handle scheduled date (can be estimatedDateOfService or scheduledDate)
    if (workOrderData.estimatedDateOfService) {
      updateData.estimatedDateOfService = workOrderData.estimatedDateOfService
    } else if (workOrderData.scheduledDate) {
      updateData.scheduledDate = workOrderData.scheduledDate
    }

    // Optional fields
    if (workOrderData.status) updateData.status = workOrderData.status
    if (workOrderData.estimatedDuration) updateData.estimatedDuration = workOrderData.estimatedDuration
    if (workOrderData.notes !== undefined) updateData.notes = workOrderData.notes
    if (workOrderData.updatedBy) updateData.updatedBy = workOrderData.updatedBy

    console.log('Update data to be saved:', JSON.stringify(updateData, null, 2))
    
    // Update the work order
    await workOrderRef.update(updateData)
    
    console.log('Work order updated successfully')

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
    
    const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId)
    const workOrderSnap = await workOrderRef.get()
    
    if (!workOrderSnap.exists) {
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
    const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId)
    console.log('Checking work order existence...')
    
    const workOrderSnap = await workOrderRef.get()
    
    if (!workOrderSnap.exists) {
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
    await workOrderRef.delete()

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