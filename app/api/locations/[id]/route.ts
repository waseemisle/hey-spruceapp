import { db } from '@/lib/firebase'

// PUT - Update existing location
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const locationId = params.id
    const locationData = await request.json()

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: 'Location ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if location exists
    const locationRef = db.collection('locations').doc(locationId)
    const locationSnap = await locationRef.get()

    if (!locationSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date().toISOString()
    }

    // Only update fields that are provided
    if (locationData.name) updateData.name = locationData.name
    if (locationData.address) updateData.address = locationData.address
    if (locationData.city) updateData.city = locationData.city
    if (locationData.state) updateData.state = locationData.state
    if (locationData.zipCode) updateData.zipCode = locationData.zipCode
    if (locationData.country) updateData.country = locationData.country
    if (locationData.description !== undefined) updateData.description = locationData.description
    if (locationData.type) updateData.type = locationData.type
    if (locationData.contactInfo) updateData.contactInfo = locationData.contactInfo
    if (locationData.additionalInfo !== undefined) updateData.additionalInfo = locationData.additionalInfo

    // If status is being updated, reset approval fields if moving to pending
    if (locationData.status) {
      updateData.status = locationData.status
      if (locationData.status === 'pending') {
        updateData.approvedBy = null
        updateData.approvedAt = null
        updateData.rejectionReason = null
      }
    }

    // Update the location
    await locationRef.update(updateData)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Location updated successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error updating location:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// GET - Get specific location by ID
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const locationId = params.id

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: 'Location ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get location document
    const locationRef = db.collection('locations').doc(locationId)
    const locationSnap = await locationRef.get()

    if (!locationSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const locationData = {
      id: locationSnap.id,
      ...locationSnap.data()
    }

    return new Response(
      JSON.stringify({
        success: true,
        location: locationData
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error fetching location:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// DELETE - Delete specific location
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const locationId = params.id

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: 'Location ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if location exists
    const locationRef = db.collection('locations').doc(locationId)
    const locationSnap = await locationRef.get()

    if (!locationSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if location is being used in work orders
    const workOrdersRef = db.collection('workOrders')
    const workOrdersQuery = workOrdersRef.where('locationId', '==', locationId)
    const workOrdersSnapshot = await workOrdersQuery.get()

    if (!workOrdersSnapshot.empty) {
      return new Response(
        JSON.stringify({ 
          error: 'Cannot delete location. It is being used in work orders.',
          workOrdersCount: workOrdersSnapshot.docs.length
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Delete the location
    await locationRef.delete()

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Location deleted successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error deleting location:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
