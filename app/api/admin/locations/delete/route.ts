import { db } from '@/lib/firebase'

// DELETE - Delete location (Admin only)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')

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
