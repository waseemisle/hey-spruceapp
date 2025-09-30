// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, deleteDoc } from 'firebase/firestore'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id

    const scheduledInvoiceRef = doc(db, COLLECTIONS.SCHEDULED_INVOICES, scheduledInvoiceId)
    await deleteDoc(scheduledInvoiceRef)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Scheduled invoice deleted successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error deleting scheduled invoice:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to delete scheduled invoice' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
