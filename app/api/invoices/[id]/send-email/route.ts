// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { Invoice } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id

    // Get invoice data
    const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc(invoiceId)
    const invoiceSnap = await invoiceRef.get()

    if (!invoiceSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const invoiceData = invoiceSnap.data() as Invoice

    // In a real implementation, you would use an email service like SendGrid, AWS SES, etc.
    // For now, we'll simulate email sending
    
    const emailContent = generateInvoiceEmail(invoiceData)
    
    // Simulate email sending
    console.log('Sending invoice email to:', invoiceData.clientEmail)
    console.log('Email content:', emailContent)

    // Update invoice status
    await invoiceRef.update({
      status: 'sent',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Invoice email sent successfully',
      recipient: invoiceData.clientEmail
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error sending invoice email:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to send invoice email' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

function generateInvoiceEmail(invoice: Invoice): string {
  return `
    Subject: Invoice ${invoice.invoiceNumber} - ${invoice.workOrderTitle}

    Dear ${invoice.clientName},

    Please find attached your invoice for the following work order:

    Work Order: ${invoice.workOrderTitle}
    Description: ${invoice.workOrderDescription}
    Location: ${invoice.workOrderLocation.name}
    Address: ${invoice.workOrderLocation.address}
    Invoice Number: ${invoice.invoiceNumber}
    Amount Due: $${invoice.totalAmount.toFixed(2)}
    Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}

    ${invoice.notes ? `Notes: ${invoice.notes}` : ''}

    Please remit payment by the due date to avoid any late fees.

    If you have any questions about this invoice, please don't hesitate to contact us.

    Thank you for your business!

    Best regards,
    Spruce App Team
    billing@spruceapp.com
    (555) 123-4567
  `
}
