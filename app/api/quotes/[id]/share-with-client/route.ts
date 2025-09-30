// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id

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

    if (quoteData.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Quote is not in pending status' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Calculate client amount with 20% markup
    const markupPercentage = 20
    const clientAmount = quoteData.originalAmount + (quoteData.originalAmount * markupPercentage / 100)

    // Update quote status and client amount using compat API
    await db.collection(COLLECTIONS.QUOTES).doc(quoteId).update({
      status: 'shared_with_client',
      clientAmount: clientAmount,
      markupPercentage: markupPercentage,
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    // Update work order status using compat API
    const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(quoteData.workOrderId).get()

    if (workOrderDoc.exists) {
      await db.collection(COLLECTIONS.WORK_ORDERS).doc(quoteData.workOrderId).update({
        status: 'quote_sent_to_client',
        sharedWithClient: true,
        updatedAt: new Date().toISOString()
      })
    }

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Quote shared with client successfully',
      clientAmount: clientAmount,
      markupPercentage: markupPercentage
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error sharing quote with client:', error)
    return new Response(
        JSON.stringify({ error: error.message || 'Failed to share quote with client' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
