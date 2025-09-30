// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id
    const { clientId, clientName, reason } = await request.json()

    // Get quote data
    const quoteRef = doc(db, COLLECTIONS.QUOTES, quoteId)
    const quoteSnap = await getDoc(quoteRef)

    if (!quoteSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Quote not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const quoteData = quoteSnap.data()

    if (quoteData.status !== 'shared_with_client') {
      return new Response(
        JSON.stringify({ error: 'Quote is not available for rejection' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update quote status
    await updateDoc(quoteRef, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      updatedAt: new Date().toISOString()
    })

    // Update work order status back to quotes_received to allow other quotes
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, quoteData.workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (workOrderSnap.exists()) {
      await updateDoc(workOrderRef, {
        status: 'quotes_received',
        updatedAt: new Date().toISOString()
      })
    }

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Quote rejected successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error rejecting quote:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to reject quote' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
