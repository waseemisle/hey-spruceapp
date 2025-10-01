// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('Fetching bidding work orders for user:', userId)

    // First get the subcontractor to find their category using compat API
    const subcontractorDoc = await db.collection(COLLECTIONS.SUBCONTRACTORS).doc(userId).get()
    
    if (!subcontractorDoc.exists) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const subcontractor = subcontractorDoc.data()
    console.log('Subcontractor found:', {
      id: userId,
      fullName: subcontractor?.fullName,
      categoryId: subcontractor?.categoryId
    })

    if (!subcontractor || !subcontractor.categoryId) {
      console.log('No category ID found for subcontractor')
      return new Response(
        JSON.stringify([]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get bidding work orders that were specifically sent to this subcontractor using compat API
    // Include both open_for_bidding and quote_submitted statuses
    const biddingWorkOrdersSnapshot = await db.collection(COLLECTIONS.BIDDING_WORK_ORDERS)
      .where('subcontractorId', '==', userId)
      .get()
    
    const biddingWorkOrders = biddingWorkOrdersSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((wo: any) => wo.status !== 'closed') // Exclude closed work orders

    console.log('Found bidding work orders for subcontractor:', biddingWorkOrders.length)
    console.log('Bidding work orders details:', biddingWorkOrders.map(bwo => ({
      id: bwo.id,
      workOrderTitle: (bwo as any).workOrderTitle,
      subcontractorId: (bwo as any).subcontractorId,
      status: (bwo as any).status
    })))

    return new Response(
        JSON.stringify(biddingWorkOrders),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching bidding work orders:', error)
    return new Response(
        JSON.stringify({ error: `Failed to fetch bidding work orders: ${error.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
