// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc } from 'firebase/firestore'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id

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

    // Update quote status and client amount
    await updateDoc(quoteRef, {
      status: 'shared_with_client',
      clientAmount: clientAmount,
      markupPercentage: markupPercentage,
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    // Update work order status
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, quoteData.workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (workOrderSnap.exists()) {
      await updateDoc(workOrderRef, {
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
