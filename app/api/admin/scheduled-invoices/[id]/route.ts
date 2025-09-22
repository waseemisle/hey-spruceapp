import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore'

// Update a scheduled invoice
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('=== UPDATE SCHEDULED INVOICE API START ===')
    console.log('Scheduled invoice ID:', params.id)
    
    const data = await request.json()
    console.log('Update data:', data)
    
    const { isActive } = data
    
    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive must be a boolean value' },
        { status: 400 }
      )
    }

    // Update the scheduled invoice
    const scheduledInvoiceRef = doc(db, 'scheduled_invoices', params.id)
    await updateDoc(scheduledInvoiceRef, {
      isActive,
      updatedAt: new Date().toISOString()
    })

    console.log('Scheduled invoice updated successfully:', params.id)

    return NextResponse.json({
      success: true,
      message: 'Scheduled invoice updated successfully'
    })

  } catch (error) {
    console.error('=== UPDATE SCHEDULED INVOICE API ERROR ===')
    console.error('Error updating scheduled invoice:', error)
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update scheduled invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Delete a scheduled invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('=== DELETE SCHEDULED INVOICE API START ===')
    console.log('Scheduled invoice ID:', params.id)
    
    // Check if scheduled invoice exists
    const scheduledInvoiceRef = doc(db, 'scheduled_invoices', params.id)
    const scheduledInvoiceDoc = await getDoc(scheduledInvoiceRef)
    
    if (!scheduledInvoiceDoc.exists()) {
      return NextResponse.json(
        { error: 'Scheduled invoice not found' },
        { status: 404 }
      )
    }

    // Delete the scheduled invoice
    await deleteDoc(scheduledInvoiceRef)

    console.log('Scheduled invoice deleted successfully:', params.id)

    return NextResponse.json({
      success: true,
      message: 'Scheduled invoice deleted successfully'
    })

  } catch (error) {
    console.error('=== DELETE SCHEDULED INVOICE API ERROR ===')
    console.error('Error deleting scheduled invoice:', error)
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to delete scheduled invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
