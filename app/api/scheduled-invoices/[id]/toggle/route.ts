// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id
    const { isActive } = await request.json()

    const scheduledInvoiceRef = doc(db, COLLECTIONS.SCHEDULED_INVOICES, scheduledInvoiceId)
    const scheduledInvoiceSnap = await getDoc(scheduledInvoiceRef)

    if (!scheduledInvoiceSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Scheduled invoice not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    await updateDoc(scheduledInvoiceRef, {
      isActive,
      updatedAt: new Date().toISOString()
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: `Scheduled invoice ${isActive ? 'activated' : 'deactivated'} successfully`
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error toggling scheduled invoice:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to toggle scheduled invoice' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
