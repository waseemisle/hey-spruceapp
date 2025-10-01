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

    // Generate PDF content
    const pdfContent = generateInvoicePDF(invoiceData)

    // In a real implementation, you would use a PDF library like jsPDF or puppeteer
    // For now, we'll simulate PDF generation
    const pdfUrl = `/invoices/${invoiceId}/invoice.pdf`

    return new Response(
        JSON.stringify({
      success: true,
      pdfUrl,
      pdfContent // In real implementation, this would be the actual PDF buffer
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error generating PDF:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to generate PDF' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

function generateInvoicePDF(invoice: Invoice): string {
  // This is a simplified PDF generation
  // In a real implementation, you would use a proper PDF library
  
  const pdfHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .invoice-title { font-size: 24px; font-weight: bold; }
        .invoice-number { font-size: 18px; color: #666; }
        .company-info { margin-top: 20px; }
        .client-info { margin-top: 20px; }
        .invoice-details { margin: 30px 0; }
        .line-items { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .line-items th, .line-items td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .line-items th { background-color: #f2f2f2; }
        .totals { margin-top: 30px; text-align: right; }
        .total-row { font-weight: bold; font-size: 16px; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="invoice-title">INVOICE</div>
        <div class="invoice-number">${invoice.invoiceNumber}</div>
        
        <div class="company-info">
          <strong>Spruce App</strong><br>
          Property Maintenance Services<br>
          Email: billing@spruceapp.com<br>
          Phone: (555) 123-4567
        </div>
        
        <div class="client-info">
          <strong>Bill To:</strong><br>
          ${invoice.clientName}<br>
          ${invoice.clientEmail}
        </div>
      </div>

      <div class="invoice-details">
        <strong>Work Order:</strong> ${invoice.workOrderTitle}<br>
        <strong>Description:</strong> ${invoice.workOrderDescription}<br>
        <strong>Location:</strong> ${invoice.workOrderLocation.name}<br>
        <strong>Address:</strong> ${invoice.workOrderLocation.address}<br>
        <strong>Subcontractor:</strong> ${invoice.subcontractorName || 'N/A'}<br>
        <strong>Invoice Date:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}<br>
        <strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}
      </div>

      <table class="line-items">
        <thead>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.lineItems.map(item => `
            <tr>
              <td>${item.description}</td>
              <td>${item.quantity}</td>
              <td>$${item.unitPrice.toFixed(2)}</td>
              <td>$${item.totalPrice.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        <div>Subtotal: $${(invoice.totalAmount - invoice.taxAmount + (invoice.discountAmount || 0)).toFixed(2)}</div>
        ${invoice.discountAmount ? `<div>Discount: -$${invoice.discountAmount.toFixed(2)}</div>` : ''}
        <div>Tax (${invoice.taxRate}%): $${invoice.taxAmount.toFixed(2)}</div>
        <div class="total-row">Total: $${invoice.totalAmount.toFixed(2)}</div>
      </div>

      ${invoice.notes ? `
        <div class="footer">
          <strong>Notes:</strong><br>
          ${invoice.notes}
        </div>
      ` : ''}

      ${invoice.terms ? `
        <div class="footer">
          <strong>Terms & Conditions:</strong><br>
          ${invoice.terms}
        </div>
      ` : ''}
    </body>
    </html>
  `

  return pdfHTML
}
