import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    console.log('Fetching bidding work orders for user:', userId)

    // First get the subcontractor to find their category
    const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, userId)
    const subcontractorDoc = await getDoc(subcontractorRef)
    
    if (!subcontractorDoc.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      )
    }

    const subcontractor = subcontractorDoc.data()
    console.log('Subcontractor found:', {
      id: userId,
      fullName: subcontractor?.fullName,
      categoryId: subcontractor?.categoryId
    })

    if (!subcontractor.categoryId) {
      console.log('No category ID found for subcontractor')
      return NextResponse.json([])
    }

    // Get bidding work orders that were specifically sent to this subcontractor
    const biddingWorkOrdersRef = collection(db, COLLECTIONS.BIDDING_WORK_ORDERS)
    const biddingWorkOrdersQuery = query(
      biddingWorkOrdersRef,
      where('subcontractorId', '==', userId),
      where('status', '==', 'open_for_bidding')
    )
    
    const biddingWorkOrdersSnapshot = await getDocs(biddingWorkOrdersQuery)
    const biddingWorkOrders = biddingWorkOrdersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log('Found bidding work orders for subcontractor:', biddingWorkOrders.length)
    console.log('Bidding work orders details:', biddingWorkOrders.map(bwo => ({
      id: bwo.id,
      workOrderTitle: bwo.workOrderTitle,
      subcontractorId: bwo.subcontractorId,
      status: bwo.status
    })))

    return NextResponse.json(biddingWorkOrders)

  } catch (error: any) {
    console.error('Error fetching bidding work orders:', error)
    return NextResponse.json(
      { error: `Failed to fetch bidding work orders: ${error.message}` },
      { status: 500 }
    )
  }
}
