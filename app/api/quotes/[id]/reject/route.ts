import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id
    const { clientId, clientName, reason } = await request.json()

    // Get quote data
    const quoteRef = doc(db, COLLECTIONS.QUOTES, quoteId)
    const quoteSnap = await getDoc(quoteRef)

    if (!quoteSnap.exists()) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      )
    }

    const quoteData = quoteSnap.data()

    if (quoteData.status !== 'shared_with_client') {
      return NextResponse.json(
        { error: 'Quote is not available for rejection' },
        { status: 400 }
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

    return NextResponse.json({
      success: true,
      message: 'Quote rejected successfully'
    })

  } catch (error: any) {
    console.error('Error rejecting quote:', error)
    return NextResponse.json(
      { error: 'Failed to reject quote' },
      { status: 500 }
    )
  }
}
