// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { Invoice, Quote } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const {
      quoteId,
      workOrderId,
      dueDate,
      notes,
      terms,
      paymentTerms,
      sendEmail = false
    } = data

    // Get quote details
    const quoteRef = db.collection(COLLECTIONS.QUOTES).doc(quoteId)
    const quoteSnap = await quoteRef.get()

    if (!quoteSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Quote not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const quoteData = quoteSnap.data() as Quote

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`

    // Create invoice
    const invoiceData: Omit<Invoice, 'id'> = {
      quoteId,
      workOrderId,
      workOrderTitle: quoteData.workOrderTitle,
      workOrderDescription: quoteData.workOrderDescription,
      workOrderLocation: quoteData.workOrderLocation,
      clientId: quoteData.clientId,
      clientName: quoteData.clientName,
      clientEmail: quoteData.clientEmail,
      subcontractorId: quoteData.subcontractorId,
      subcontractorName: quoteData.subcontractorName,
      subcontractorEmail: quoteData.subcontractorEmail,
      status: 'draft',
      totalAmount: quoteData.clientAmount, // Use client amount (with markup)
      laborCost: quoteData.laborCost,
      materialCost: quoteData.materialCost,
      additionalCosts: quoteData.additionalCosts,
      taxRate: quoteData.taxRate,
      taxAmount: quoteData.taxAmount,
      discountAmount: quoteData.discountAmount,
      lineItems: quoteData.lineItems,
      notes: notes || quoteData.notes,
      terms: terms || quoteData.terms,
      dueDate,
      invoiceNumber,
      createdBy: data.adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const docRef = await db.collection(COLLECTIONS.INVOICES).add(invoiceData)

    // Generate PDF
    try {
      const pdfResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/invoices/${docRef.id}/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoiceId: docRef.id })
      })

      if (pdfResponse.ok) {
        const pdfData = await pdfResponse.json()
        
        // Update invoice with PDF URL
        await db.collection(COLLECTIONS.INVOICES).doc(docRef.id).update({
          pdfUrl: pdfData.pdfUrl,
          status: sendEmail ? 'sent' : 'draft',
          sentAt: sendEmail ? new Date().toISOString() : undefined,
          updatedAt: new Date().toISOString()
        })
      }
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError)
      // Continue without PDF for now
    }

    // Send email if requested
    if (sendEmail) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/invoices/${docRef.id}/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ invoiceId: docRef.id })
        })
      } catch (emailError) {
        console.error('Email sending error:', emailError)
        // Continue without email for now
      }
    }

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Invoice created successfully',
      invoiceId: docRef.id,
      invoiceNumber
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to create invoice' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
