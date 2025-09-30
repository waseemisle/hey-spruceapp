import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

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

    console.log('Fetching assigned work orders for user:', userId)

    // Get work orders that are assigned to this subcontractor
    const workOrdersRef = collection(db, COLLECTIONS.WORK_ORDERS)
    const workOrdersQuery = query(
      workOrdersRef,
      where('assignedTo', '==', userId)
    )
    
    const workOrdersSnapshot = await getDocs(workOrdersQuery)
    const workOrders = workOrdersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log('Found assigned work orders:', workOrders.length)

    return NextResponse.json(workOrders)

  } catch (error: any) {
    console.error('Error fetching assigned work orders:', error)
    return NextResponse.json(
      { error: `Failed to fetch assigned work orders: ${error.message}` },
      { status: 500 }
    )
  }
}
