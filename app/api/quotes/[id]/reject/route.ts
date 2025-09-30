// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id
    const { clientId, clientName, reason } = await request.json()

    // Get quote data using compat API
    const quoteDoc = await db.collection(COLLECTIONS.QUOTES).doc(quoteId).get()

    if (!quoteDoc.exists) {
      return new Response(
        JSON.stringify({ error: 'Quote not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const quoteData = quoteDoc.data()

    if (!quoteData) {
      return new Response(
        JSON.stringify({ error: 'Quote data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (quoteData.status !== 'shared_with_client') {
      return new Response(
        JSON.stringify({ error: 'Quote is not available for rejection' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update quote status using compat API
    await db.collection(COLLECTIONS.QUOTES).doc(quoteId).update({
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      updatedAt: new Date().toISOString()
    })

    // Update work order status back to quotes_received to allow other quotes using compat API
    const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(quoteData.workOrderId).get()

    if (workOrderDoc.exists) {
      await db.collection(COLLECTIONS.WORK_ORDERS).doc(quoteData.workOrderId).update({
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
