import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id
    const { isActive } = await request.json()

    const scheduledInvoiceRef = doc(db, COLLECTIONS.SCHEDULED_INVOICES, scheduledInvoiceId)
    const scheduledInvoiceSnap = await getDoc(scheduledInvoiceRef)

    if (!scheduledInvoiceSnap.exists()) {
      return NextResponse.json(
        { error: 'Scheduled invoice not found' },
        { status: 404 }
      )
    }

    await updateDoc(scheduledInvoiceRef, {
      isActive,
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: `Scheduled invoice ${isActive ? 'activated' : 'deactivated'} successfully`
    })

  } catch (error: any) {
    console.error('Error toggling scheduled invoice:', error)
    return NextResponse.json(
      { error: 'Failed to toggle scheduled invoice' },
      { status: 500 }
    )
  }
}
