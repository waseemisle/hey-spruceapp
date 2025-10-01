// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    // console.log('Client work orders API - clientId:', clientId)

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get work orders for specific client
    const { data, error } = await getDocuments(COLLECTIONS.WORK_ORDERS, [
      { type: 'where', field: 'clientId', operator: '==', value: clientId }
    ])
    
    // console.log('Found work orders:', data?.length || 0)
    
    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch work orders' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Enhance work orders with location data
    const enhancedWorkOrders = await Promise.all(
      (data || []).map(async (workOrder: any) => {
        try {
          // If work order has locationId but location is not an object (could be a string), fetch location data
          if (workOrder.locationId && (typeof workOrder.location !== 'object' || !workOrder.location)) {
            const locationRef = db.collection('locations').doc(workOrder.locationId)
            const locationSnap = await locationRef.get()
            
            if (locationSnap.exists) {
              const locationData = locationSnap.data()
              workOrder.location = {
                id: workOrder.locationId,
                name: locationData?.name || 'Unknown Location',
                address: locationData?.address || ''
              }
            } else {
              workOrder.location = {
                id: workOrder.locationId,
                name: 'Location not found',
                address: ''
              }
            }
          }
          return workOrder
        } catch (locationError) {
          console.error('Error fetching location for work order:', workOrder.id, locationError)
          // Return work order with fallback location
          workOrder.location = {
            id: workOrder.locationId || '',
            name: 'Location not found',
            address: ''
          }
          return workOrder
        }
      })
    )

    // console.log('Enhanced work orders:', enhancedWorkOrders.length)

    return new Response(
        JSON.stringify(enhancedWorkOrders),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching client work orders:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch work orders' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
