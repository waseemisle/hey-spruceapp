// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { Invoice } from '@/lib/types'
import { generateInvoicePDF, PDFInvoiceData } from '@/lib/pdf-service'

export async function GET(
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

    // Transform to PDF data format
    const pdfData: PDFInvoiceData = {
      invoiceId: invoiceId,
      invoiceNumber: invoiceData.invoiceNumber,
      clientName: invoiceData.clientName,
      clientEmail: invoiceData.clientEmail,
      workOrderTitle: invoiceData.workOrderTitle,
      workOrderDescription: invoiceData.workOrderDescription,
      workOrderLocation: invoiceData.workOrderLocation,
      totalAmount: invoiceData.totalAmount,
      laborCost: invoiceData.laborCost || 0,
      materialCost: invoiceData.materialCost || 0,
      additionalCosts: invoiceData.additionalCosts || 0,
      taxRate: invoiceData.taxRate,
      taxAmount: invoiceData.taxAmount,
      discountAmount: invoiceData.discountAmount,
      lineItems: invoiceData.lineItems,
      dueDate: invoiceData.dueDate,
      createdAt: invoiceData.createdAt,
      notes: invoiceData.notes,
      terms: invoiceData.terms,
      subcontractorName: invoiceData.subcontractorName
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(pdfData)

    // Return PDF - convert Buffer to Uint8Array for Response
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoiceData.invoiceNumber}.pdf"`
      }
    })

  } catch (error: any) {
    console.error('Error downloading invoice:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to download invoice' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
