// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
// Update a scheduled invoice
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('=== UPDATE SCHEDULED INVOICE API START ===')
    console.log('Scheduled invoice ID:', params.id)
    
    const data = await request.json()
    console.log('Update data:', data)
    
    const { isActive } = data
    
    if (typeof isActive !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'isActive must be a boolean value' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update the scheduled invoice
    const scheduledInvoiceRef = db.collection('scheduled_invoices').doc(params.id)
    await scheduledInvoiceRef.update({
      isActive,
      updatedAt: new Date().toISOString()
    })

    console.log('Scheduled invoice updated successfully:', params.id)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Scheduled invoice updated successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== UPDATE SCHEDULED INVOICE API ERROR ===')
    console.error('Error updating scheduled invoice:', error)
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to update scheduled invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Delete a scheduled invoice
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('=== DELETE SCHEDULED INVOICE API START ===')
    console.log('Scheduled invoice ID:', params.id)
    
    // Check if scheduled invoice exists
    const scheduledInvoiceRef = db.collection('scheduled_invoices').doc(params.id)
    const scheduledInvoiceDoc = await scheduledInvoiceRef.get()
    
    if (!scheduledInvoiceDoc.exists) {
      return new Response(
        JSON.stringify({ error: 'Scheduled invoice not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Delete the scheduled invoice
    await scheduledInvoiceRef.delete()

    console.log('Scheduled invoice deleted successfully:', params.id)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Scheduled invoice deleted successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== DELETE SCHEDULED INVOICE API ERROR ===')
    console.error('Error deleting scheduled invoice:', error)
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to delete scheduled invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
