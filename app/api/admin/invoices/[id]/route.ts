import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Update invoice status
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('=== INVOICE UPDATE API START ===')
    
    const invoiceId = params.id
    const data = await request.json()
    const { status, adminId, paymentMethod, paymentReference } = data

    console.log('Updating invoice:', invoiceId, 'status:', status)

    // Validate required fields
    if (!status || !adminId) {
      return NextResponse.json(
        { error: 'Status and Admin ID are required' },
        { status: 400 }
      )
    }

    // Get current invoice
    const invoiceRef = doc(db, 'invoices', invoiceId)
    const invoiceDoc = await getDoc(invoiceRef)
    
    if (!invoiceDoc.exists()) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    const currentInvoice = invoiceDoc.data()
    console.log('Current invoice:', currentInvoice)

    // Prepare update data
    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    }

    // Add status-specific timestamps
    if (status === 'sent') {
      updateData.sentAt = new Date().toISOString()
    } else if (status === 'paid') {
      updateData.paidAt = new Date().toISOString()
      if (paymentMethod) updateData.paymentMethod = paymentMethod
      if (paymentReference) updateData.paymentReference = paymentReference
    }

    // Update invoice
    await updateDoc(invoiceRef, updateData)
    console.log('Invoice updated successfully')

    // Update workflow status
    if (status === 'sent') {
      await updateWorkflowStatus(currentInvoice.workOrderId, 'invoice_sent', adminId, `Invoice sent to client`)
    } else if (status === 'paid') {
      await updateWorkflowStatus(currentInvoice.workOrderId, 'invoice_paid', adminId, `Invoice paid by client`)
    }

    console.log('=== INVOICE UPDATE API SUCCESS ===')

    return NextResponse.json({
      success: true,
      message: 'Invoice updated successfully'
    })

  } catch (error) {
    console.error('=== INVOICE UPDATE API ERROR ===')
    console.error('Error updating invoice:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      invoiceId: params.id
    })
    console.error('=== END ERROR LOG ===')
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Helper function to update workflow status
async function updateWorkflowStatus(workOrderId: string, step: string, updatedBy: string, notes?: string) {
  try {
    const { collection, addDoc } = await import('firebase/firestore')
    const workflowRef = collection(db, 'workflow_status')
    const workflowData = {
      workOrderId,
      currentStep: step,
      status: step.includes('completed') ? 'completed' : 'in_progress',
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: updatedBy,
      notes
    }
    
    await addDoc(workflowRef, workflowData)
    console.log('Workflow status updated:', workflowData)
  } catch (error) {
    console.error('Error updating workflow status:', error)
  }
}

