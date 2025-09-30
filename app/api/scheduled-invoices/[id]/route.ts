import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, deleteDoc } from 'firebase/firestore'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id

    const scheduledInvoiceRef = doc(db, COLLECTIONS.SCHEDULED_INVOICES, scheduledInvoiceId)
    await deleteDoc(scheduledInvoiceRef)

    return NextResponse.json({
      success: true,
      message: 'Scheduled invoice deleted successfully'
    })

  } catch (error: any) {
    console.error('Error deleting scheduled invoice:', error)
    return NextResponse.json(
      { error: 'Failed to delete scheduled invoice' },
      { status: 500 }
    )
  }
}
