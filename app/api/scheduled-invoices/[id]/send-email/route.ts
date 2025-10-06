import { db, COLLECTIONS } from '@/lib/firebase'
import { sendInvoiceEmail } from '@/lib/sendgrid-service'

// Send email for a scheduled invoice
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id
    
    console.log('=== SEND SCHEDULED INVOICE EMAIL START ===')
    console.log('Scheduled Invoice ID:', scheduledInvoiceId)
    
    // Get the scheduled invoice
    const docRef = db.collection(COLLECTIONS.SCHEDULED_INVOICES).doc(scheduledInvoiceId)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      return new Response(
        JSON.stringify({ error: 'Scheduled invoice not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const scheduledInvoice = { id: doc.id, ...doc.data() } as any
    
    // Check if it's active
    if (!scheduledInvoice.isActive) {
      return new Response(
        JSON.stringify({ error: 'Scheduled invoice is not active' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const now = new Date()
    const nowISO = now.toISOString()
    
    // Create invoice data (similar to execute endpoint)
    const invoiceData = {
      invoiceId: `PREVIEW-${scheduledInvoiceId.substring(0, 8).toUpperCase()}`,
      invoiceNumber: `SCHED-${scheduledInvoiceId.substring(0, 8).toUpperCase()}`,
      clientName: scheduledInvoice.clientName,
      clientEmail: scheduledInvoice.clientEmail,
      workOrderTitle: scheduledInvoice.title,
      workOrderDescription: scheduledInvoice.description || '',
      workOrderLocation: { 
        name: 'Scheduled Service', 
        address: 'As per agreement' 
      },
      totalAmount: scheduledInvoice.amount,
      laborCost: 0,
      materialCost: scheduledInvoice.amount,
      additionalCosts: 0,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      lineItems: [{
        id: '1',
        description: scheduledInvoice.description || scheduledInvoice.title,
        quantity: 1,
        unitPrice: scheduledInvoice.amount,
        totalPrice: scheduledInvoice.amount,
        category: scheduledInvoice.categoryName || 'other'
      }],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      createdAt: nowISO,
      notes: scheduledInvoice.notes || 'This is a preview of your scheduled invoice.',
      terms: 'Payment due within 30 days of invoice date.',
      subcontractorName: 'Scheduled Service'
    }
    
    // Send email to client with PDF attachment
    console.log('Sending email to:', scheduledInvoice.clientEmail)
    
    const emailResult = await sendInvoiceEmail({
      invoiceId: invoiceData.invoiceId,
      clientName: scheduledInvoice.clientName,
      clientEmail: scheduledInvoice.clientEmail,
      workOrderTitle: scheduledInvoice.title,
      totalAmount: scheduledInvoice.amount,
      dueDate: invoiceData.dueDate,
      invoiceData
    })
    
    if (!emailResult.success) {
      console.error('Email sending failed:', emailResult.error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send email',
          details: emailResult.error 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('Email sent successfully to:', scheduledInvoice.clientEmail)
    console.log('=== SEND SCHEDULED INVOICE EMAIL COMPLETE ===')
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent successfully to ${scheduledInvoice.clientEmail}`,
        emailResult
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('=== SEND SCHEDULED INVOICE EMAIL ERROR ===')
    console.error('Error sending scheduled invoice email:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send scheduled invoice email',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

