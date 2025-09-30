import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { Invoice } from '@/lib/types'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id

    // Get invoice data
    const invoiceRef = doc(db, COLLECTIONS.INVOICES, invoiceId)
    const invoiceSnap = await getDoc(invoiceRef)

    if (!invoiceSnap.exists()) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
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
    await updateDoc(invoiceRef, {
      status: 'sent',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Invoice email sent successfully',
      recipient: invoiceData.clientEmail
    })

  } catch (error: any) {
    console.error('Error sending invoice email:', error)
    return NextResponse.json(
      { error: 'Failed to send invoice email' },
      { status: 500 }
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
