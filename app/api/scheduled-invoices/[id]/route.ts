// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id

    const scheduledInvoiceRef = db.collection(COLLECTIONS.SCHEDULED_INVOICES).doc(scheduledInvoiceId)
    await scheduledInvoiceRef.delete()

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
