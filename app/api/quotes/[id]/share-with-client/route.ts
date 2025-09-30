import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc } from 'firebase/firestore'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const quoteId = params.id

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

    if (!quoteData) {
      return NextResponse.json(
        { error: 'Quote data not found' },
        { status: 404 }
      )
    }

    if (quoteData.status !== 'pending') {
      return NextResponse.json(
        { error: 'Quote is not in pending status' },
        { status: 400 }
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

    return NextResponse.json({
      success: true,
      message: 'Quote shared with client successfully',
      clientAmount: clientAmount,
      markupPercentage: markupPercentage
    })

  } catch (error: any) {
    console.error('Error sharing quote with client:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to share quote with client' },
      { status: 500 }
    )
  }
}
