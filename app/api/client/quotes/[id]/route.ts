import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Update quote status (approve/reject)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id
    const { status, clientId } = await request.json()

    if (!quoteId || !status || !clientId) {
      return NextResponse.json(
        { error: 'Quote ID, status, and client ID are required' },
        { status: 400 }
      )
    }

    if (!['accepted', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be either "accepted" or "rejected"' },
        { status: 400 }
      )
    }

    console.log(`Updating quote ${quoteId} to status: ${status}`)

    // Get the quote to verify ownership
    const quoteRef = doc(db, 'quotes', quoteId)
    const quoteSnap = await getDoc(quoteRef)

    if (!quoteSnap.exists()) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      )
    }

    const quoteData = quoteSnap.data()

    // Verify the client owns this quote
    if (quoteData.clientId !== clientId) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only update your own quotes' },
        { status: 403 }
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

    return NextResponse.json({
      success: true,
      message: `Quote ${status} successfully`,
      quoteId,
      status
    })

  } catch (error) {
    console.error('Error updating quote:', error)
    return NextResponse.json(
      { error: 'Failed to update quote' },
      { status: 500 }
    )
  }
}