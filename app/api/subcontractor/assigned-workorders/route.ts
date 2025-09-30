// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

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

    return new Response(
        JSON.stringify(workOrders),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching assigned work orders:', error)
    return new Response(
        JSON.stringify({ error: `Failed to fetch assigned work orders: ${error.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
