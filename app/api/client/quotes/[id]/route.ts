// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Update quote status (approve/reject)
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id
    const { status, clientId } = await request.json()

    if (!quoteId || !status || !clientId) {
      return new Response(
        JSON.stringify({ error: 'Quote ID, status, and client ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!['accepted', 'rejected'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'Status must be either "accepted" or "rejected"' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Updating quote ${quoteId} to status: ${status}`)

    // Get the quote to verify ownership
    const quoteRef = doc(db, 'quotes', quoteId)
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

    // Verify the client owns this quote
    if (quoteData.clientId !== clientId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: You can only update your own quotes' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update the quote status
    await updateDoc(quoteRef, {
      status: status,
      updatedAt: new Date().toISOString(),
      ...(status === 'accepted' && { acceptedAt: new Date().toISOString() }),
      ...(status === 'rejected' && { rejectedAt: new Date().toISOString() })
    })

    // Update the associated work order with quote status
    if (quoteData.workOrderId) {
      const workOrderRef = doc(db, 'workorders', quoteData.workOrderId)
      await updateDoc(workOrderRef, {
        quoteStatus: status,
        quoteId: quoteId,
        ...(status === 'accepted' && { 
          quoteApprovedAt: new Date().toISOString(),
          quoteApprovedBy: clientId
        }),
        updatedAt: new Date().toISOString()
      })
      console.log(`Work order ${quoteData.workOrderId} updated with quote status: ${status}`)
    }

    console.log(`Quote ${quoteId} updated to ${status} by client ${clientId}`)

    return new Response(
        JSON.stringify({
      success: true,
      message: `Quote ${status} successfully`,
      quoteId,
      status
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error updating quote:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to update quote' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}